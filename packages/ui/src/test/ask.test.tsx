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

describe('Ask — routing and URL state', () => {
  it('round-trips a question through the URL', () => {
    const route = { view: 'ask' as const, id: 'What breaks if Alex leaves?' };
    expect(parseHash(hrefFor(route))).toEqual({ ...route, finding: undefined });
  });

  it('opens with the question in the URL and answers without typing', async () => {
    open(`#/ask/${encodeURIComponent('What breaks if Alex leaves?')}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Ask TraceFlow' })).toBeInTheDocument();
    // The answer card appears with the question as its heading.
    expect(await screen.findByRole('heading', { level: 2, name: 'What breaks if Alex leaves?' })).toBeInTheDocument();
    expect(screen.getByText('Person blast radius')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the investigation' })).toHaveAttribute('href', '#/impact/alex');
  });
});

describe('Ask — the deterministic answer end to end', () => {
  it('answers a typed question with evidence, caveats and a deep link', async () => {
    const user = userEvent.setup();
    open('#/ask');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ask TraceFlow' })).toBeInTheDocument();

    const input = screen.getByLabelText('Your question');
    await user.type(input, 'What is the risk around Alex Rivera?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'What is the risk around Alex Rivera?' })).toBeInTheDocument();
    expect(screen.getByText('Person risk profile')).toBeInTheDocument();
    expect(window.location.hash).toContain('#/ask/What%20is%20the%20risk%20around%20Alex%20Rivera%3F'.replace('#/ask/', ''));

    // Supporting records from the engine's evidence, and the honest caveats.
    expect(screen.getByText('Supporting records')).toBeInTheDocument();
    expect(screen.getByText('Payments on-call guide')).toBeInTheDocument();

    // The deep link lands on the person's investigation.
    const link = screen.getByRole('link', { name: 'Open the investigation' });
    expect(link).toHaveAttribute('href', '#/people/alex');
    await user.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: 'Alex Rivera' })).toBeInTheDocument();
  });

  it('deep links an epic-impact answer to the epic tab of the impact view', async () => {
    open(`#/ask/${encodeURIComponent('Who is the payments single point of failure?')}`);
    await screen.findByRole('heading', { level: 2, name: 'Who is the payments single point of failure?' });
    expect(screen.getByRole('link', { name: 'Open the investigation' })).toHaveAttribute('href', '#/impact/epic/PAY-1');
    expect(screen.getByText('Epic blast radius')).toBeInTheDocument();
  });

  it('deep links a decision-trace answer into the decisions view', async () => {
    open(`#/ask/${encodeURIComponent('What is the status of the idempotency decision?')}`);
    await screen.findByRole('heading', { level: 2, name: 'What is the status of the idempotency decision?' });
    expect(screen.getByRole('link', { name: 'Open the investigation' })).toHaveAttribute('href', '#/decisions/d3');
    // The evidence list dedupes repeated records (one record can support
    // several findings), so keys stay unique.
    const card = screen.getByRole('region', { name: 'What is the status of the idempotency decision?' });
    expect(within(card).getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});

describe('Ask — honest misses and the scope join', () => {
  it('shows the honest miss with clickable suggestions', async () => {
    const user = userEvent.setup();
    open(`#/ask/${encodeURIComponent('What is the weather on mars?')}`);
    expect(await screen.findByText('Not answered')).toBeInTheDocument();
    expect(screen.getByText(/could not map that question/i)).toBeInTheDocument();

    // The suggestion chips live in the answer card; scope to it so the
    // starter chips below the form do not double-match.
    const card = screen.getByRole('region', { name: 'What is the weather on mars?' });
    const suggestion = within(card).getByRole('button', { name: 'What are the biggest knowledge risks right now?' });
    await user.click(suggestion);
    expect(await screen.findByRole('heading', { level: 2, name: 'What are the biggest knowledge risks right now?' })).toBeInTheDocument();
    expect(screen.getByText('Knowledge-risk ranking')).toBeInTheDocument();
  });

  it('shows the scope-join answer: two candidates named, never picked', async () => {
    open(`#/ask/${encodeURIComponent('Which decision is blocking the payments work?')}`);
    await screen.findByText('Not answered');
    const text = screen.getByText(/more than one decision/i);
    expect(text).toBeInTheDocument();
    // Both candidates with statuses, from the recorded links.
    expect(screen.getByText(/d1 'queue vs cron for retries'/)).toBeInTheDocument();
    expect(screen.getByText(/d3 'idempotency key scope'/)).toBeInTheDocument();
    expect(screen.getByText(/waiting on Alex Rivera/)).toBeInTheDocument();
  });

  it('shows the informed empty answer when nothing is linked', async () => {
    open(`#/ask/${encodeURIComponent('Which decision is blocking the onboarding work?')}`);
    expect(await screen.findByText(/No decision is linked to work in Onboarding revamp \(ONB-1\)/)).toBeInTheDocument();
  });
});

describe('Ask — states', () => {
  it('shows an empty state when nothing is connected', async () => {
    const empty: OrgGraph = { people: [], workItems: [], pages: [], pullRequests: [], decisions: [] };
    open('#/ask', createStaticAdapter('empty', empty));
    expect(await screen.findByRole('heading', { name: 'Nothing to ask about yet' })).toBeInTheDocument();
  });

  it('keeps the starters working and the input in sync', async () => {
    const user = userEvent.setup();
    open('#/ask');
    await screen.findByRole('heading', { level: 1, name: 'Ask TraceFlow' });
    await user.click(screen.getByRole('button', { name: 'Give me an overview of the organization' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Give me an overview of the organization' })).toBeInTheDocument();
    // The input mirrors the answered question (URL is the state).
    expect(screen.getByLabelText('Your question')).toHaveValue('Give me an overview of the organization');
  });
});
