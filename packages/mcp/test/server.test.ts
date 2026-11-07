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
  it('lists all six tools with schemas and truth notes', async () => {
    const { client, close } = await connect();
    const listed = (await client.listTools()) as ListToolsResult;
    const names = listed.tools.map((t) => t.name);
    expect(names).toEqual([
      'traceflow_list_people',
      'traceflow_person_risk',
      'traceflow_person_impact',
      'traceflow_epic_lineage',
      'traceflow_decision_trace',
      'traceflow_overview',
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
});
