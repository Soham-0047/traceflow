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
    expect(parseHash('')).toEqual({ view: 'people', id: undefined, finding: undefined });
  });
});

describe('People', () => {
  it('opens on the highest-risk person with a ledger that adds up', async () => {
    open('');
    expect(await screen.findByRole('heading', { level: 1, name: 'Alex Rivera' })).toBeInTheDocument();
    expect(screen.getByText('High risk')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Handover ledger for Alex Rivera/ });
    const footer = within(table).getAllByRole('row').at(-1)!;
    expect(within(footer).getByText('63')).toBeInTheDocument();
  });

  it('starts with an empty evidence drawer and fills it from a ledger row', async () => {
    const user = userEvent.setup();
    open('');
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
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Alex Rivera' })).toBeInTheDocument());
  });

  it('empty', async () => {
    const empty: OrgGraph = { people: [], workItems: [], pages: [], pullRequests: [], decisions: [] };
    open('', createStaticAdapter('empty', empty));
    expect(await screen.findByRole('heading', { name: 'No people yet' })).toBeInTheDocument();
  });
});
