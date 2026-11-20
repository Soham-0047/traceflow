import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

// The default export under test wires itself to the site-graph loader; mock it
// so the handler can be exercised end to end without Forge (UNVERIFIED in the
// real runtime until spike S3 — see app/src/backend/agent.ts).
vi.mock('../src/backend/site-graph', () => ({
  loadSanitizedSiteGraph: async () => (await import('@traceflow/core')).sampleGraph,
}));

import { answerQuery, sampleGraph } from '@traceflow/core';
import { createInvestigateAction, investigate } from '../src/backend/agent';

const here = fileURLToPath(new URL('.', import.meta.url));

/** An in-memory graph loader with call recording, for the factory tests. */
function loader(graph = sampleGraph) {
  const calls: (string | undefined)[] = [];
  return {
    calls,
    loadGraph: async (siteUrl?: string) => {
      calls.push(siteUrl);
      return graph;
    },
  };
}

describe('createInvestigateAction (the Rovo agent action)', () => {
  it('returns the deterministic engine answer verbatim in the payload', async () => {
    const action = createInvestigateAction({ loadGraph: loader().loadGraph });
    const question = 'What are the biggest knowledge risks right now?';
    const payload = await action({ question });

    // The payload IS the AnswerResult: no model sits between the chat and the
    // engine's own words, so the agent can never originate a fact.
    expect(payload).toEqual(answerQuery(sampleGraph, question));
    expect(payload.understood).toBe(true);
    expect(payload.evidence.length).toBeGreaterThan(0);
    expect(payload.caveats.length).toBeGreaterThan(0);
  });

  it('relays an honest miss with the answerable suggestions', async () => {
    const action = createInvestigateAction({ loadGraph: loader().loadGraph });
    const payload = await action({ question: 'what is the weather on mars?' });
    expect(payload.understood).toBe(false);
    expect(payload.suggestions?.length).toBeGreaterThan(0);
    expect(payload.answer).toContain('could not map');
  });

  it('survives model-mangled inputs: missing, non-string, empty and whitespace', async () => {
    const action = createInvestigateAction({ loadGraph: loader().loadGraph });
    for (const bad of [
      {},
      { question: 42 },
      { question: null },
      { question: '   ' },
      undefined as never,
    ]) {
      const payload = await action(bad);
      expect(payload.understood).toBe(false);
      expect(payload.answer).toContain('No question was provided');
      expect(payload.suggestions?.length).toBeGreaterThan(0);
    }
  });

  it('refuses an over-long question instead of feeding it to the engine', async () => {
    const action = createInvestigateAction({ loadGraph: loader().loadGraph });
    const payload = await action({ question: 'x'.repeat(501) });
    expect(payload.understood).toBe(false);
    expect(payload.answer).toContain('too long');
    // A 500-character question is still fine (exactly at the cap).
    const ok = await action({ question: `${'x'.repeat(494)} Alex?` });
    expect(ok.understood).toBe(true);
    expect(ok.intent).toBe('person-risk');
  });

  it('degrades honestly when the site graph cannot be read', async () => {
    const logError = vi.fn();
    const action = createInvestigateAction({
      loadGraph: () => Promise.reject(new Error('KVS unreachable')),
      logError,
    });
    const payload = await action({ question: 'What is the risk around Alex?' });
    expect(payload.understood).toBe(false);
    expect(payload.answer).toContain('could not be read');
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('passes the invoking user to the loader so reads run with their permissions', async () => {
    const seen: (string | undefined)[] = [];
    const action = createInvestigateAction({
      loadGraph: async (_siteUrl, accountId) => {
        seen.push(accountId);
        return sampleGraph;
      },
    });
    await action({ question: 'Overview?' }, { principal: { accountId: 'acc-1' } });
    await action({ question: 'Overview?' }, { accountId: 'acc-2' });
    await action({ question: 'Overview?', context: { accountId: 'acc-3' } });
    await action({ question: 'Overview?' });
    expect(seen).toEqual(['acc-1', 'acc-2', 'acc-3', undefined]);
  });

  it('derives the site url from the Jira or Confluence view context for record links', async () => {
    const dep = loader();
    const action = createInvestigateAction({ loadGraph: dep.loadGraph });

    await action({ question: 'Overview?', context: { jira: { url: 'https://mysite.atlassian.net/browse/FAA-1' } } });
    expect(dep.calls.at(-1)).toBe('https://mysite.atlassian.net');

    await action({ question: 'Overview?', context: { confluence: { url: 'https://wiki.example.com/wiki/spaces/X/PAGE' } } });
    expect(dep.calls.at(-1)).toBe('https://wiki.example.com');

    await action({ question: 'Overview?', context: { jira: { url: 'not a url' } } });
    expect(dep.calls.at(-1)).toBeUndefined();
  });

  it('answers an epic-impact and a decision-impact question through the same path', async () => {
    const action = createInvestigateAction({ loadGraph: loader().loadGraph });
    const epic = await action({ question: 'What breaks if the Payments reliability epic changes?' });
    expect(epic.understood).toBe(true);
    expect(epic.intent).toBe('epic-impact');
    expect(epic.answer).toContain('If Payments reliability (PAY-1) changes');

    const decision = await action({ question: 'What happens if the idempotency key scope decision changes?' });
    expect(decision.understood).toBe(true);
    expect(decision.intent).toBe('decision-impact');
  });
});

describe('the default export and manifest wiring (UNVERIFIED until deploy)', () => {
  it('exposes a handler the manifest can point at, and it answers end to end', async () => {
    expect(typeof investigate).toBe('function');
    // Through the mocked site-graph loader, the default wiring behaves like a
    // deployed action answering on the sample story.
    const payload = await investigate({ question: 'What breaks if Alex leaves?' });
    expect(payload.understood).toBe(true);
    expect(payload.intent).toBe('person-impact');
    expect(payload).toEqual(answerQuery(sampleGraph, 'What breaks if Alex leaves?'));
  });

  it('keeps the manifest keys, handler path, action and agent entries consistent', () => {
    const manifest = parse(readFileSync(join(here, '..', 'manifest.yml'), 'utf8'));
    const fn = manifest.modules.function.find((f: { key: string }) => f.key === 'tf-investigate');
    expect(fn.handler).toBe('backend/tools.investigate');
    const action = manifest.modules.action.find((a: { key: string }) => a.key === 'traceflow-investigate');
    expect(action).toMatchObject({ function: 'tf-investigate', actionVerb: 'GET' });
    expect(action.inputs.question).toMatchObject({ type: 'string', required: true });
    const agent = manifest.modules['rovo:agent'][0];
    expect(agent.key).toBe('traceflow-analyst');
    // The agent name stays within the 30-character platform limit.
    expect(agent.name.length).toBeLessThanOrEqual(30);
    expect(agent.prompt).toContain('never add');
    expect(agent.conversationStarters.length).toBeGreaterThan(0);
    expect(agent.actions).toContain('traceflow-investigate');
  });
});
