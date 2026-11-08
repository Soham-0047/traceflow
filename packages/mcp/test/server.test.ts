import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { createTraceflowServer } from '../src/server.js';

/** Wire a real MCP client to the server over the SDK's in-memory transport. */
async function connect() {
  const server = createTraceflowServer();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return {
    client,
    async call(name: string, args: Record<string, string> = {}) {
      return (await client.callTool({ name, arguments: args })) as CallToolResult & {
        isError?: boolean;
      };
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}

function parse<T>(result: CallToolResult): T {
  const block = result.content?.[0];
  if (!block || block.type !== 'text') throw new Error('expected text content');
  return JSON.parse(block.text) as T;
}

describe('TraceFlow MCP server over the wire', () => {
  it('lists all nine tools with schemas and truth notes', async () => {
    const { client, close } = await connect();
    const listed = (await client.listTools()) as ListToolsResult;
    const names = listed.tools.map((t) => t.name);
    expect(names).toEqual([
      'traceflow_list_people',
      'traceflow_person_risk',
      'traceflow_person_impact',
      'traceflow_epic_lineage',
      'traceflow_decision_trace',
      'traceflow_epic_impact',
      'traceflow_decision_impact',
      'traceflow_overview',
      'traceflow_query',
    ]);
    for (const tool of listed.tools) {
      expect(tool.description).toMatch(/not found in the connected data/);
    }
    await close();
  });

  it('ranks people by risk with the evidence-first wording kept', async () => {
    const { call, close } = await connect();
    const payload = parse<{ people: { name: string; score: number; level: string }[] }>(
      await call('traceflow_list_people'),
    );
    expect(payload.people[0]?.name).toBe('Alex Rivera');
    expect(payload.people[0]?.level).toBe('high');
    await close();
  });

  it('resolves a person by prefix and returns findings with evidence records', async () => {
    const { call, close } = await connect();
    const report = parse<{
      personName: string;
      score: number;
      findings: { kind: string; evidence: { source: string; id: string }[] }[];
    }>(await call('traceflow_person_risk', { person: 'Alex' }));
    expect(report.personName).toBe('Alex Rivera');
    const sole = report.findings.find((f) => f.kind === 'sole-contributor-page');
    expect(sole?.evidence.length).toBeGreaterThan(0);
    expect(sole?.evidence[0]?.source).toBe('confluence');
    await close();
  });

  it('returns the blast radius for a person by exact name', async () => {
    const { call, close } = await connect();
    const impact = parse<{
      counts: { orphanedPages: number; blockedDecisions: number; unmergedChanges: number };
      areas: { kind: string }[];
    }>(await call('traceflow_person_impact', { person: 'Alex Rivera' }));
    expect(impact.counts.orphanedPages).toBe(7);
    expect(impact.counts.blockedDecisions).toBe(2);
    expect(impact.counts.unmergedChanges).toBe(2);
    expect(impact.areas.some((a) => a.kind === 'stalled-epic')).toBe(true);
    await close();
  });

  it('traces an epic by key with lanes and gaps', async () => {
    const { call, close } = await connect();
    const lineage = parse<{
      epic: { id: string };
      nodes: { lane: string }[];
      gaps: { kind: string; evidence: unknown[] }[];
      coverage: { confluence: boolean; code: boolean };
    }>(await call('traceflow_epic_lineage', { epic: 'pay-1' }));
    expect(lineage.epic.id).toBe('PAY-1');
    expect(lineage.coverage.confluence).toBe(true);
    expect(lineage.coverage.code).toBe(true);
    expect(lineage.gaps.length).toBeGreaterThan(0);
    expect(new Set(lineage.nodes.map((n) => n.lane))).toEqual(
      new Set(['intent', 'plan', 'work', 'code']),
    );
    await close();
  });

  it('traces a decision by a unique part of its title', async () => {
    const { call, close } = await connect();
    const decision = parse<{
      decision: { id: string };
      status: string;
      linkedWork: { id: string }[];
      findings: { kind: string }[];
    }>(await call('traceflow_decision_trace', { decision: 'queue vs cron' }));
    expect(decision.decision.id).toBe('d1');
    expect(decision.linkedWork.map((w) => w.id)).toContain('PAY-12');
    expect(decision.findings.some((f) => f.kind === 'unapproved-decision')).toBe(true);
    await close();
  });

  it('answers an overview with counts, top people and epic ranking', async () => {
    const { call, close } = await connect();
    const overview = parse<{
      counts: { people: number; epics: number; soleContributorPages: number };
      topPeople: { personName: string }[];
      epics: { epic: { id: string }; gaps: number }[];
    }>(await call('traceflow_overview'));
    expect(overview.counts.people).toBe(3);
    expect(overview.counts.soleContributorPages).toBe(8);
    expect(overview.topPeople[0]?.personName).toBe('Alex Rivera');
    expect(overview.epics[0]?.epic.id).toBe('PAY-1');
    await close();
  });

  it('returns the blast radius for an epic with who needs to know', async () => {
    const { call, close } = await connect();
    const impact = parse<{
      epic: { id: string };
      counts: { orphanedWork: number; staleSpecs: number; unreviewedChanges: number };
      people: { person: { id: string }; roles: string[] }[];
      gaps: { kind: string }[];
    }>(await call('traceflow_epic_impact', { epic: 'Payments reliability' }));
    expect(impact.epic.id).toBe('PAY-1');
    expect(impact.counts).toEqual({ orphanedWork: 4, staleSpecs: 5, unreviewedChanges: 2 });
    expect(impact.people.map((p) => p.person.id)).toEqual(['alex', 'sam']);
    expect(impact.gaps.length).toBe(2);
    await close();
  });

  it('returns the blast radius for a decision, and fails helpfully for an unknown one', async () => {
    const { call, close } = await connect();
    const impact = parse<{
      decision: { id: string };
      status: string;
      counts: { outdatedWork: number; outdatedChanges: number };
      people: { person: { id: string }; roles: string[] }[];
    }>(await call('traceflow_decision_impact', { decision: 'idempotency key scope' }));
    expect(impact.decision.id).toBe('d3');
    expect(impact.status).toBe('proposed');
    expect(impact.counts).toEqual({ outdatedWork: 1, outdatedChanges: 1 });
    expect(impact.people[0]?.roles).toHaveLength(4);

    const unknown = await call('traceflow_decision_impact', { decision: 'a decision that never existed' });
    expect(unknown.isError).toBe(true);
    const block = unknown.content?.[0];
    expect(block && block.type === 'text' ? block.text : '').toMatch(/No decision matches/);
    await close();
  });

  it('fails helpfully for an unknown person, over the protocol', async () => {
    const { call, close } = await connect();
    const result = await call('traceflow_person_risk', { person: 'Nobody Here' });
    expect(result.isError).toBe(true);
    const block = result.content?.[0];
    expect(block && block.type === 'text' ? block.text : '').toMatch(/Known people:/);
    await close();
  });

  it('serves a custom graph source through the adapter contract', async () => {
    const { sampleGraph } = await import('@traceflow/core');
    const emptyGraph = {
      ...sampleGraph,
      people: [],
      workItems: [],
      pages: [],
      pullRequests: [],
      decisions: [],
    };
    const server = createTraceflowServer({ name: 'empty', loadGraph: async () => emptyGraph });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    const result = (await client.callTool({
      name: 'traceflow_list_people',
      arguments: {},
    })) as CallToolResult;
    const block = result.content?.[0];
    expect(block && block.type === 'text').toBe(true);
    if (block && block.type === 'text') {
      expect(JSON.parse(block.text).people).toEqual([]);
    }
    await client.close();
    await server.close();
  });

  it('answers a natural-language question deterministically via traceflow_query', async () => {
    const { call, close } = await connect();
    const answer = parse<{
      intent: string;
      understood: boolean;
      answer: string;
      evidence: { source: string; id: string }[];
      caveats: string[];
    }>(await call('traceflow_query', { question: 'What breaks if Alex Rivera leaves?' }));
    expect(answer.understood).toBe(true);
    expect(answer.intent).toBe('person-impact');
    expect(answer.answer).toContain('If Alex Rivera becomes unavailable');
    expect(answer.evidence.length).toBeGreaterThan(0);
    expect(answer.caveats.length).toBeGreaterThan(0);
    await close();
  });

  it('traceflow_query admits when it cannot map a question, with suggestions', async () => {
    const { call, close } = await connect();
    const answer = parse<{ understood: boolean; suggestions: string[] }>(
      await call('traceflow_query', { question: 'what is the weather on mars?' }),
    );
    expect(answer.understood).toBe(false);
    expect(answer.suggestions?.length).toBeGreaterThan(0);
    await close();
  });

  it('quarantines broken records from a source and still serves the good ones', async () => {
    const { sampleGraph } = await import('@traceflow/core');
    const corrupt = {
      ...sampleGraph,
      workItems: [
        ...sampleGraph.workItems,
        // Broken: status is not an enum value -> quarantined, not fatal.
        { ref: { source: 'jira', id: 'BAD-1', title: 'Broken' }, status: 'wednesday' },
        // Dangling refs -> dropped with warnings.
        { ref: { source: 'jira', id: 'PAY-99', title: 'Dangling' }, assigneeId: 'ghost', status: 'open', linkedPageIds: ['p1'] },
      ],
    };
    const server = createTraceflowServer({ name: 'corrupt', loadGraph: async () => corrupt as never });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    const result = (await client.callTool({
      name: 'traceflow_query',
      arguments: { question: 'What are the biggest knowledge risks right now?' },
    })) as CallToolResult;
    const block = result.content?.[0];
    expect(block && block.type === 'text').toBe(true);
    if (block && block.type === 'text') {
      const payload = JSON.parse(block.text) as { understood: boolean; answer: string };
      expect(payload.understood).toBe(true);
      expect(payload.answer).toContain('Alex Rivera');
    }
    await client.close();
    await server.close();
  });

  it('validatedSource logs every warning and quarantine notice once, and caches the sanitized graph', async () => {
    const { sampleGraph, personImpact } = await import('@traceflow/core');
    const { validatedSource } = await import('../src/server.js');
    const logs: string[] = [];
    let loads = 0;
    const corrupt = {
      ...sampleGraph,
      workItems: [
        ...sampleGraph.workItems,
        { ref: { source: 'jira', id: 'BAD-1', title: 'Broken' }, status: 'wednesday' },
      ],
    };
    const source = validatedSource(
      { name: 'corrupt', loadGraph: async () => { loads++; return corrupt as never; } },
      (line) => logs.push(line),
    );
    const graph1 = await source.loadGraph();
    const graph2 = await source.loadGraph();
    expect(loads).toBe(1); // one load, one pipeline, cached after that
    expect(graph1).toBe(graph2);
    expect(graph1.workItems.some((w) => w.ref.id === 'BAD-1')).toBe(false);
    expect(logs.some((l) => l.includes('quarantined $.workItems[11]'))).toBe(true);
    // The sanitized graph still answers engine questions.
    expect(personImpact(graph1, 'alex').counts.orphanedPages).toBe(7);
  });
});
