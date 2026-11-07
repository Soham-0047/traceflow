import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildOverview,
  personImpact,
  rankPeopleByRisk,
  sampleGraph,
  traceDecision,
  traceEpic,
} from '@traceflow/core';
import type { DataAdapter, OrgGraph, Person, WorkItem } from '@traceflow/core';

/**
 * The MCP surface of TraceFlow: the same engine and the same DataAdapter contract
 * the Workbench UI uses, exposed as tools for any MCP-capable agent.
 *
 * Truth rules (they apply to every tool):
 *  - findings come from records, never from a model;
 *  - every result carries evidence records (source, id, title, url when known);
 *  - a missing link means "not found in the connected data", never "does not exist".
 */

/** Any DataAdapter can feed the server: the sample fixtures, a graph export, a Forge resolver. */
export type GraphSource = Pick<DataAdapter, 'name' | 'loadGraph'>;

export const SAMPLE_SOURCE: GraphSource = {
  name: 'sample',
  loadGraph: async () => sampleGraph,
};

const TRUTH_NOTE =
  'Every finding lists its evidence records. A missing link means not found in the connected data, not that it does not exist.';

/** Resolve a person by id, exact name, or name prefix; fail with a helpful list. */
function resolvePerson(graph: OrgGraph, query: string): Person {
  const q = query.trim();
  const byId = graph.people.find((p) => p.id === q);
  if (byId) return byId;
  const byName = graph.people.find((p) => p.name.toLowerCase() === q.toLowerCase());
  if (byName) return byName;
  const byPrefix = graph.people.filter((p) =>
    p.name.toLowerCase().startsWith(q.toLowerCase()),
  );
  if (byPrefix.length === 1) return byPrefix[0]!;
  throw new Error(
    byPrefix.length > 1
      ? `Multiple people match '${query}': ${byPrefix.map((p) => p.name).join(', ')}. Use the exact name or id.`
      : `No person matches '${query}'. Known people: ${graph.people.map((p) => `${p.name} (${p.id})`).join(', ') || 'none'}.`,
  );
}

function resolveEpic(graph: OrgGraph, query: string): WorkItem {
  const q = query.trim().toLowerCase();
  const epic = graph.workItems.find(
    (w) => w.type === 'epic' && (w.ref.id.toLowerCase() === q || w.ref.title.toLowerCase() === q),
  );
  if (epic) return epic;
  const contains = graph.workItems.filter(
    (w) => w.type === 'epic' && w.ref.title.toLowerCase().includes(q),
  );
  if (contains.length === 1) return contains[0]!;
  throw new Error(
    contains.length > 1
      ? `Multiple epics match '${query}': ${contains.map((e) => e.ref.id).join(', ')}.`
      : `No epic matches '${query}'. Known epics: ${
          graph.workItems.filter((w) => w.type === 'epic').map((w) => w.ref.id).join(', ') || 'none'
        }.`,
  );
}

function resolveDecisionId(graph: OrgGraph, query: string): string {
  const q = query.trim().toLowerCase();
  const byId = graph.decisions.find((d) => d.ref.id.toLowerCase() === q);
  if (byId) return byId.ref.id;
  const byTitle = graph.decisions.find((d) => d.ref.title.toLowerCase() === q);
  if (byTitle) return byTitle.ref.id;
  const contains = graph.decisions.filter((d) => d.ref.title.toLowerCase().includes(q));
  if (contains.length === 1) return contains[0]!.ref.id;
  throw new Error(
    contains.length > 1
      ? `Multiple decisions match '${query}': ${contains.map((d) => d.ref.id).join(', ')}.`
      : `No decision matches '${query}'. Known decisions: ${
          graph.decisions.map((d) => d.ref.id).join(', ') || 'none'
        }.`,
  );
}

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** Build the TraceFlow MCP server over a graph source. */
export function createTraceflowServer(source: GraphSource = SAMPLE_SOURCE): McpServer {
  const server = new McpServer(
    { name: 'traceflow', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  const load = () => source.loadGraph();

  server.registerTool(
    'traceflow_list_people',
    {
      title: 'List people by knowledge risk',
      description:
        `List everyone in the connected records with their knowledge-risk score, level and open finding counts, highest risk first. Data source: ${source.name}. ${TRUTH_NOTE}`,
      inputSchema: {},
    },
    async () => {
      const graph = await load();
      const ranked = rankPeopleByRisk(graph).map((r) => ({
        id: r.personId,
        name: r.personName,
        score: r.score,
        level: r.level,
        findings: r.findings.length,
      }));
      return text({ people: ranked, caveats: ['Scores come from recorded activity only; they cannot prove who understands what.'] });
    },
  );

  server.registerTool(
    'traceflow_person_risk',
    {
      title: 'Investigate a person',
      description:
        'Full knowledge-risk report for one person: findings with evidence records, points, suggested actions, and what the data cannot show. ' +
        TRUTH_NOTE,
      inputSchema: { person: z.string().describe('Person id, exact name, or unique name prefix (e.g. "Alex" or "alex")') },
    },
    async ({ person }) => {
      const graph = await load();
      try {
        const target = resolvePerson(graph, person);
        const report = rankPeopleByRisk(graph).find((r) => r.personId === target.id);
        if (!report) return fail(`No report could be built for ${target.name}.`);
        return text(report);
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'traceflow_person_impact',
    {
      title: 'What breaks without a person',
      description:
        'Change-impact blast radius for one person: the epics, open work, pages, decisions and pull requests that lose their recorded owner. ' +
        TRUTH_NOTE,
      inputSchema: { person: z.string().describe('Person id, exact name, or unique name prefix') },
    },
    async ({ person }) => {
      const graph = await load();
      try {
        const target = resolvePerson(graph, person);
        return text(personImpact(graph, target.id));
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'traceflow_epic_lineage',
    {
      title: 'Trace an epic',
      description:
        'Lineage for one epic: intent, plan, work and code records, the recorded links between them, and the gaps with evidence. ' +
        TRUTH_NOTE,
      inputSchema: { epic: z.string().describe('Epic key or title, e.g. "PAY-1"') },
    },
    async ({ epic }) => {
      const graph = await load();
      try {
        const target = resolveEpic(graph, epic);
        return text(traceEpic(graph, target.ref.id));
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'traceflow_decision_trace',
    {
      title: 'Trace a decision',
      description:
        'One recorded decision: status, linked work, people and their roles, and findings (unapproved, superseded, stale). ' +
        TRUTH_NOTE,
      inputSchema: { decision: z.string().describe('Decision id or title (a unique part of the title works)') },
    },
    async ({ decision }) => {
      const graph = await load();
      try {
        return text(traceDecision(graph, resolveDecisionId(graph, decision)));
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'traceflow_overview',
    {
      title: 'Organization overview',
      description:
        'Aggregates for the whole connected graph: record counts, top knowledge-risk people, epics ranked by gaps, and coverage caveats. ' +
        TRUTH_NOTE,
      inputSchema: {},
    },
    async () => {
      const graph = await load();
      return text(buildOverview(graph));
    },
  );

  return server;
}
