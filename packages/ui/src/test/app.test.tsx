import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStaticAdapter, sampleGraph } from '@traceflow/core';
import type { DataAdapter, OrgGraph } from '@traceflow/core';
import { Workbench } from '../Workbench';
import { parseHash, hrefFor } from '../router';

const ready = createStaticAdapter('test', sampleGraph);

function open(hash: string, adapter: DataAdapter = ready) {
  window.history.replaceState(null, '', `/${hash}`);
  return render(<Workbench adapter={adapter} sourceNote="Sample data" />);
}

describe('router', () => {
  it('round-trips routes', () => {
    const route = { view: 'people' as const, id: 'alex', finding: 'open-work-1' };
    expect(parseHash(hrefFor(route))).toEqual(route);
    expect(parseHash('')).toEqual({ view: 'overview', id: undefined, finding: undefined });
  });
});

describe('Overview', () => {
  it('is the landing view and shows top risks, epic ranking and record counts', async () => {
    open('');
    expect(await screen.findByRole('heading', { level: 1, name: 'Organization overview' })).toBeInTheDocument();

    const risks = screen.getByRole('table', { name: /highest knowledge-risk people/ });
    expect(within(risks).getByRole('link', { name: 'Alex Rivera' })).toBeInTheDocument();
    expect(within(risks).getByText('High risk')).toBeInTheDocument();

    const epicTable = screen.getByRole('table', { name: /Epics ranked by the number of gaps/ });
    const epicRows = within(epicTable).getAllByRole('row');
    expect(epicRows[1]).toHaveTextContent('PAY-1');
    expect(epicRows[1]).toHaveTextContent('4');
    expect(epicRows[1]).toHaveTextContent('2');

    const records = screen.getByRole('table', { name: /What is counted/ });
    expect(within(records).getByText('Pages with a sole contributor')).toBeInTheDocument();
    expect(within(records).getByText('8')).toBeInTheDocument();
  });

  it('links from the overview into a person investigation', async () => {
    const user = userEvent.setup();
    open('');
    await screen.findByRole('heading', { level: 1, name: 'Organization overview' });
    await user.click(screen.getByRole('link', { name: 'Alex Rivera' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Alex Rivera' })).toBeInTheDocument();
    expect(window.location.hash).toContain('#/people/alex');
  });

  it('shows an empty state when nothing is connected', async () => {
    const empty: OrgGraph = { people: [], workItems: [], pages: [], pullRequests: [], decisions: [] };
    open('', createStaticAdapter('empty', empty));
    expect(await screen.findByRole('heading', { name: 'Nothing to investigate yet' })).toBeInTheDocument();
  });
});

describe('People', () => {
  it('opens on the highest-risk person with a ledger that adds up', async () => {
    open('#/people');
    expect(await screen.findByRole('heading', { level: 1, name: 'Alex Rivera' })).toBeInTheDocument();
    expect(screen.getByText('High risk')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Handover ledger for Alex Rivera/ });
    const footer = within(table).getAllByRole('row').at(-1)!;
    expect(within(footer).getByText('63')).toBeInTheDocument();
  });

  it('starts with an empty evidence drawer and fills it from a ledger row', async () => {
    const user = userEvent.setup();
    open('#/people');
    await screen.findByRole('heading', { level: 1, name: 'Alex Rivera' });
    expect(screen.getByText(/Select a finding to see why it was flagged/)).toBeInTheDocument();

    const ledger = screen.getByRole('table', { name: /Handover ledger/ });
    await user.click(within(ledger).getByRole('button', { name: /unresolved issue\(s\) assigned to Alex Rivera/ }));
    const drawer = screen.getByRole('complementary');
    expect(within(drawer).getByText('Why it was flagged')).toBeInTheDocument();
    expect(within(drawer).getByText('Fix duplicate charge on retry')).toBeInTheDocument();
    expect(window.location.hash).toContain('/finding/open-work-1');
  });

  it('restores a selected finding from the URL', async () => {
    open('#/people/alex/finding/sole-contributor-page-0');
    const drawer = await screen.findByRole('complementary');
    expect(await within(drawer).findByText('Payments retry design')).toBeInTheDocument();
  });

  it('shows a clean ledger for someone with nothing at risk', async () => {
    open('#/people/priya');
    expect(await screen.findByRole('heading', { level: 1, name: 'Priya Nair' })).toBeInTheDocument();
  });
});

describe('Epics', () => {
  it('shows the four lanes and the gaps for PAY-1', async () => {
    open('#/epics/PAY-1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Payments reliability' })).toBeInTheDocument();
    for (const lane of ['Intent', 'Plan', 'Work', 'Code']) {
      expect(screen.getByRole('heading', { name: lane })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /finished issue\(s\) have no linked pull request/ })).toBeInTheDocument();
  });

  it('describes a record when a node is selected and dims unrelated nodes', async () => {
    const user = userEvent.setup();
    open('#/epics/PAY-1');
    await screen.findByRole('heading', { level: 1, name: 'Payments reliability' });
    const node = screen.getByRole('button', { name: /PAY-15 Add idempotency keys/ });
    await user.click(node);
    expect(node).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /PAY-7 Dead-letter queue alerts/ })).toHaveAttribute('data-dim', 'true');
    expect(within(screen.getByRole('complementary')).getByText(/recorded links? in this epic/)).toBeInTheDocument();
  });

  it('flags an epic with no recorded specification', async () => {
    open('#/epics/ONB-1');
    expect(await screen.findByRole('button', { name: /No linked specification or decision/ })).toBeInTheDocument();
  });
});

describe('Decisions', () => {
  it('lists linked work, people with roles and findings', async () => {
    open('#/decisions/d1');
    expect(await screen.findByRole('heading', { level: 1, name: 'queue vs cron for retries' })).toBeInTheDocument();
    expect(screen.getByText('PAY-12')).toBeInTheDocument();
    expect(screen.getByText(/pending approver/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Decision is waiting on input/ })).toBeInTheDocument();
  });
});

describe('Impact', () => {
  it('opens on the highest-risk person with the blast-radius counts', async () => {
    open('#/impact');
    expect(await screen.findByRole('heading', { level: 1, name: 'Alex Rivera: what is left behind' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Change impact' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stalled epics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Orphaned knowledge' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Blocked decisions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unmerged changes' })).toBeInTheDocument();
  });

  it('fills the evidence drawer from an impact row and keeps the selection in the URL', async () => {
    const user = userEvent.setup();
    open('#/impact');
    await screen.findByRole('heading', { level: 1, name: 'Alex Rivera: what is left behind' });
    expect(screen.getByText(/Select a finding to see why it was flagged/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open issue\(s\) in Payments reliability stall/ }));
    const drawer = screen.getByRole('complementary');
    expect(within(drawer).getByText('Why it was flagged')).toBeInTheDocument();
    expect(within(drawer).getByText('Fix duplicate charge on retry')).toBeInTheDocument();
    expect(window.location.hash).toContain('/finding/stalled-epic-0');
  });

  it('restores a selected orphaned page from the URL', async () => {
    open('#/impact/alex/finding/orphaned-page-2');
    const drawer = await screen.findByRole('complementary');
    expect(await within(drawer).findAllByText('Auth service runbook').then((els) => els.length >= 1)).toBe(true);
    expect(within(drawer).getByText(/only recorded contributor/)).toBeInTheDocument();
  });

  it('shows a clean impact for someone with nothing tied to them alone', async () => {
    const quiet: OrgGraph = {
      ...sampleGraph,
      people: [...sampleGraph.people, { id: 'jordan', name: 'Jordan Blake' }],
    };
    open('#/impact/jordan', createStaticAdapter('quiet', quiet));
    expect(await screen.findByRole('heading', { level: 1, name: 'Jordan Blake: what is left behind' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing in the connected records depends on Jordan Blake alone/)).toBeInTheDocument();
  });

  it('shows an empty state when nobody is connected', async () => {
    const empty: OrgGraph = { people: [], workItems: [], pages: [], pullRequests: [], decisions: [] };
    open('#/impact', createStaticAdapter('empty', empty));
    expect(await screen.findByRole('heading', { name: 'No people yet' })).toBeInTheDocument();
  });
});

describe('Regions have four states', () => {
  it('loading', async () => {
    open('', { name: 'loading', loadGraph: () => new Promise<OrgGraph>(() => {}) });
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('error, with a retry that works', async () => {
    const user = userEvent.setup();
    let fail = true;
    const flaky: DataAdapter = {
      name: 'flaky',
      loadGraph: () => (fail ? Promise.reject(new Error('Boom.')) : Promise.resolve(sampleGraph)),
    };
    open('', flaky);
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom.');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Organization overview' })).toBeInTheDocument(),
    );
  });

  it('empty', async () => {
    const empty: OrgGraph = { people: [], workItems: [], pages: [], pullRequests: [], decisions: [] };
    open('#/people', createStaticAdapter('empty', empty));
    expect(await screen.findByRole('heading', { name: 'No people yet' })).toBeInTheDocument();
  });
});
