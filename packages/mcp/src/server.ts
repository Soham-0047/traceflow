import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ANSWERABLE_QUESTIONS,
  answerQuery,
  buildOverview,
  decisionImpact,
  epicImpact,
  personImpact,
  rankPeopleByRisk,
  resolveDecisionId,
  resolveEpic,
  resolvePerson,
  sampleGraph,
  runPipeline,
  traceDecision,
  traceEpic,
} from '@traceflow/core';
import type { DataAdapter, OrgGraph } from '@traceflow/core';

/**
 * The MCP surface of TraceFlow: the same engine and the same DataAdapter contract
 * the Workbench UI uses, exposed as tools for any MCP-capable agent.
 *
 * Truth rules (they apply to every tool):
 *  - findings come from records, never from a model;
 *  - every result carries evidence records (source, id, title, url when known);
 *  - a missing link means "not found in the connected data", never "does not exist".
 *
 * Entity resolution uses the shared fuzzy matchers from @traceflow/core
 * (matcher.ts): the same typo-tolerant, ambiguity-aware matching that powers
 * the natural-language answer layer, so `person: "Alexs Rivera"` works the
 * same way whether an agent or a human typed it.
 */

/** Any DataAdapter can feed the server: the sample fixtures, a graph export, a Forge resolver. */
export type GraphSource = Pick<DataAdapter, 'name' | 'loadGraph'>;

/**
 * Wrap any graph source in the validation pipeline (best-effort): broken records
 * are quarantined, dangling references dropped, and every warning is logged once
 * to stderr (the log channel for stdio MCP). A hostile or partially-broken source
 * can serve degraded-but-honest data instead of crashing every tool call.
 */
export function validatedSource(source: GraphSource, log: (line: string) => void = console.error): GraphSource {
  let cached: Promise<OrgGraph> | undefined;
  return {
    name: source.name,
    loadGraph: async () => {
      if (!cached) {
        cached = (async () => {
          const result = runPipeline(await source.loadGraph(), {
            mode: 'best-effort',
            context: `source '${source.name}'`,
          });
          for (const warning of result.warnings) {
            log(`traceflow-mcp: warning: ${warning.path}: ${warning.message}`);
          }
          for (const rejected of result.rejected) {
            log(`traceflow-mcp: quarantined ${rejected.path}: ${rejected.reason}`);
          }
          return result.graph;
        })();
        cached.catch(() => {
          // Do not cache a failed load; the next call retries the source.
          cached = undefined;
        });
      }
      return cached;
    },
  };
}

const TRUTH_NOTE =
  'Every finding lists its evidence records. A missing link means not found in the connected data, not that it does not exist.';

export const SAMPLE_SOURCE: GraphSource = {
  name: 'sample',
  loadGraph: async () => sampleGraph,
};

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** Build the TraceFlow MCP server over a graph source (validated through the pipeline). */
export function createTraceflowServer(source: GraphSource = SAMPLE_SOURCE): McpServer {
  const server = new McpServer(
    { name: 'traceflow', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  // One validated wrapper per server: the pipeline runs once per source load
  // and the sanitized graph is shared by every tool.
  const validated = validatedSource(source);
  const load = () => validated.loadGraph();

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
      inputSchema: { person: z.string().describe('Person id, name, name prefix or a close typo (e.g. "Alex Rivera", "alex", "rivera")') },
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
      inputSchema: { person: z.string().describe('Person id, name, name prefix or a close typo') },
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
      inputSchema: { epic: z.string().describe('Epic key or title, any case (e.g. "PAY-1", "pay-1", "Payments reliability")') },
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
      inputSchema: { decision: z.string().describe('Decision id or title, or a distinctive title word (e.g. "d3", "idempotency key scope", "the idempotency decision")') },
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
    'traceflow_epic_impact',
    {
      title: 'What breaks if an epic changes',
      description:
        'Change-impact blast radius for one epic: the open work that loses its recorded plan, the linked pages and decisions worth re-checking, the open pull requests that may implement outdated intent, the people who need to know, and the epic’s pre-existing lineage gaps. ' +
        TRUTH_NOTE,
      inputSchema: { epic: z.string().describe('Epic key or title, any case (e.g. "PAY-1", "pay-1", "Payments reliability")') },
    },
    async ({ epic }) => {
      const graph = await load();
      try {
        const target = resolveEpic(graph, epic);
        return text(epicImpact(graph, target.ref.id));
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'traceflow_decision_impact',
    {
      title: 'What breaks if a decision changes',
      description:
        'Change-impact blast radius for one decision: the open work linked to it that must be reviewed, the open pull requests that may implement the wrong intent, and the people who need to know. ' +
        TRUTH_NOTE,
      inputSchema: { decision: z.string().describe('Decision id or title, or a distinctive title word (e.g. "d3", "idempotency key scope")') },
    },
    async ({ decision }) => {
      const graph = await load();
      try {
        return text(decisionImpact(graph, resolveDecisionId(graph, decision)));
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

  server.registerTool(
    'traceflow_query',
    {
      title: 'Ask a question (deterministic, no model)',
      description:
        'Ask one natural-language question about people, risk, impact, epics or decisions. The answer is produced by the deterministic engine — never by a language model — and carries its evidence records and caveats. ' +
        `Answerable questions include: ${ANSWERABLE_QUESTIONS.map((q) => q.example).join(' ; ')}. ` +
        'When the question cannot be mapped to the connected data, the tool says so and lists what it can answer instead of guessing. ' +
        TRUTH_NOTE,
      inputSchema: { question: z.string().min(1).describe('The question, e.g. "What are the biggest knowledge risks right now?"') },
    },
    async ({ question }) => {
      const graph = await load();
      return text(answerQuery(graph, question));
    },
  );

  return server;
}
