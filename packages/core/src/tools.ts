import { decisionImpact, epicImpact, personImpact } from './impact.js';
import { traceDecision, traceEpic } from './lineage.js';
import { resolveDecisionId, resolveEpic, resolvePerson } from './matcher.js';
import { buildOverview } from './overview.js';
import { ANSWERABLE_QUESTIONS, answerQuery } from './query.js';
import { rankPeopleByRisk } from './risk.js';
import type { OrgGraph } from './types.js';

/*
 * The TraceFlow tool catalog: one transport-free definition of every tool,
 * served by two hosts that must never drift apart —
 *  - the standalone MCP server (packages/mcp: `name`, stdio, any MCP client);
 *  - the Forge app's Rovo actions, exposed to Rovo agents and, through the
 *    `rovo:mcp` module, to external MCP clients on Atlassian's MCP
 *    infrastructure (app/manifest.yml: `actionKey`).
 * A test in packages/core and the manifest check (scripts/forge-check.mjs)
 * pin both hosts to this list.
 *
 * Truth rules (every tool): findings come from records, never from a model;
 * every result carries evidence records; a missing link means "not found in
 * the connected data", never "does not exist". Inputs are untrusted (a model
 * extracts them from chat): they are type-checked, length-capped and only
 * ever used to select records, never for authorization.
 */

export const TOOL_TRUTH_NOTE =
  'Every finding lists its evidence records. A missing link means not found in the connected data, not that it does not exist.';

/** Longest accepted tool argument; anything longer is refused, not truncated. */
export const MAX_TOOL_ARGUMENT_LENGTH = 500;

export interface ToolInput {
  name: string;
  title: string;
  description: string;
}

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string };

export interface ToolSpec {
  /** MCP tool name (packages/mcp). */
  name: string;
  /** Forge action key (app/manifest.yml); also the rovo:mcp tool name. */
  actionKey: string;
  /** Forge function key backing the action (Forge caps function keys at 23 characters). */
  functionKey: string;
  /** Exported handler name in app/src/backend/tools.ts. */
  handler: string;
  title: string;
  /** One line for the Forge action (Forge caps action descriptions at 255 characters). */
  summary: string;
  /** The full MCP description (summary plus details and the truth note). */
  description: string;
  /** At most one required string input. */
  input?: ToolInput;
  run(graph: OrgGraph, arg: string | undefined): unknown;
}

const PERSON_INPUT: ToolInput = {
  name: 'person',
  title: 'Person',
  description: 'Person id, name, name prefix or a close typo (e.g. "Alex Rivera", "alex", "rivera")',
};
const EPIC_INPUT: ToolInput = {
  name: 'epic',
  title: 'Epic',
  description: 'Epic key or title, any case (e.g. "PAY-1", "pay-1", "Payments reliability")',
};
const DECISION_INPUT: ToolInput = {
  name: 'decision',
  title: 'Decision',
  description: 'Decision id or title, or a distinctive title word (e.g. "d3", "idempotency key scope", "the idempotency decision")',
};

export const TRACEFLOW_TOOLS: readonly ToolSpec[] = [
  {
    name: 'traceflow_list_people',
    actionKey: 'traceflow-list-people',
    functionKey: 'tf-list-people',
    handler: 'listPeople',
    title: 'List people by knowledge risk',
    summary:
      'Lists everyone in the connected Jira and Confluence records with their knowledge-risk score, level and finding count, highest risk first. Read-only.',
    description:
      'List everyone in the connected records with their knowledge-risk score, level and open finding counts, highest risk first. ' +
      TOOL_TRUTH_NOTE,
    run: (graph) => ({
      people: rankPeopleByRisk(graph).map((r) => ({
        id: r.personId,
        name: r.personName,
        score: r.score,
        level: r.level,
        findings: r.findings.length,
      })),
      caveats: ['Scores come from recorded activity only; they cannot prove who understands what.'],
    }),
  },
  {
    name: 'traceflow_person_risk',
    actionKey: 'traceflow-person-risk',
    functionKey: 'tf-person-risk',
    handler: 'personRisk',
    title: 'Investigate a person',
    summary:
      'Full knowledge-risk report for one person: findings with their evidence records, points, suggested hand-off actions and what the records cannot show. Read-only.',
    description:
      'Full knowledge-risk report for one person: findings with evidence records, points, suggested actions, and what the data cannot show. ' +
      TOOL_TRUTH_NOTE,
    input: PERSON_INPUT,
    run: (graph, person) => {
      const target = resolvePerson(graph, person ?? '');
      const report = rankPeopleByRisk(graph).find((r) => r.personId === target.id);
      if (!report) throw new Error(`No report could be built for ${target.name}.`);
      return report;
    },
  },
  {
    name: 'traceflow_person_impact',
    actionKey: 'traceflow-person-impact',
    functionKey: 'tf-person-impact',
    handler: 'personImpact',
    title: 'What breaks without a person',
    summary:
      'Blast radius if one person becomes unavailable: the epics, open work, pages, decisions and pull requests that lose their recorded owner, with evidence. Read-only.',
    description:
      'Change-impact blast radius for one person: the epics, open work, pages, decisions and pull requests that lose their recorded owner. ' +
      TOOL_TRUTH_NOTE,
    input: PERSON_INPUT,
    run: (graph, person) => personImpact(graph, resolvePerson(graph, person ?? '').id),
  },
  {
    name: 'traceflow_epic_lineage',
    actionKey: 'traceflow-epic-lineage',
    functionKey: 'tf-epic-lineage',
    handler: 'epicLineage',
    title: 'Trace an epic',
    summary:
      'Traces one epic from intent to plan, work and code: the recorded links between them and the gaps, each with its evidence records. Read-only.',
    description:
      'Lineage for one epic: intent, plan, work and code records, the recorded links between them, and the gaps with evidence. ' +
      TOOL_TRUTH_NOTE,
    input: EPIC_INPUT,
    run: (graph, epic) => traceEpic(graph, resolveEpic(graph, epic ?? '').ref.id),
  },
  {
    name: 'traceflow_decision_trace',
    actionKey: 'traceflow-decision-trace',
    functionKey: 'tf-decision-trace',
    handler: 'decisionTrace',
    title: 'Trace a decision',
    summary:
      'Traces one recorded decision: its status, the work linked to it, the people and their roles, and findings such as unapproved or superseded decisions still in use. Read-only.',
    description:
      'One recorded decision: status, linked work, people and their roles, and findings (unapproved, superseded, stale). ' +
      TOOL_TRUTH_NOTE,
    input: DECISION_INPUT,
    run: (graph, decision) => traceDecision(graph, resolveDecisionId(graph, decision ?? '')),
  },
  {
    name: 'traceflow_epic_impact',
    actionKey: 'traceflow-epic-impact',
    functionKey: 'tf-epic-impact',
    handler: 'epicImpact',
    title: 'What breaks if an epic changes',
    summary:
      'Blast radius if one epic changes: open work that loses its plan, pages and decisions to re-check, open pull requests on outdated intent, and who needs to know. Read-only.',
    description:
      'Change-impact blast radius for one epic: the open work that loses its recorded plan, the linked pages and decisions worth re-checking, the open pull requests that may implement outdated intent, the people who need to know, and the epic’s pre-existing lineage gaps. ' +
      TOOL_TRUTH_NOTE,
    input: EPIC_INPUT,
    run: (graph, epic) => epicImpact(graph, resolveEpic(graph, epic ?? '').ref.id),
  },
  {
    name: 'traceflow_decision_impact',
    actionKey: 'traceflow-decision-impact',
    functionKey: 'tf-decision-impact',
    handler: 'decisionImpact',
    title: 'What breaks if a decision changes',
    summary:
      'Blast radius if one decision changes: the open work linked to it that must be reviewed, open pull requests that may implement the wrong intent, and who needs to know. Read-only.',
    description:
      'Change-impact blast radius for one decision: the open work linked to it that must be reviewed, the open pull requests that may implement the wrong intent, and the people who need to know. ' +
      TOOL_TRUTH_NOTE,
    input: DECISION_INPUT,
    run: (graph, decision) => decisionImpact(graph, resolveDecisionId(graph, decision ?? '')),
  },
  {
    name: 'traceflow_overview',
    actionKey: 'traceflow-overview',
    functionKey: 'tf-overview',
    handler: 'overview',
    title: 'Organization overview',
    summary:
      'Organization overview from the connected records: record counts, the top knowledge-risk people, epics ranked by recorded gaps, and coverage caveats. Read-only.',
    description:
      'Aggregates for the whole connected graph: record counts, top knowledge-risk people, epics ranked by gaps, and coverage caveats. ' +
      TOOL_TRUTH_NOTE,
    run: (graph) => buildOverview(graph),
  },
  {
    name: 'traceflow_query',
    actionKey: 'traceflow-investigate',
    functionKey: 'tf-investigate',
    handler: 'investigate',
    title: 'Ask a question (deterministic, no model)',
    summary:
      "Answers a question about knowledge-continuity risk, change impact, lineage or decisions from this site's Jira and Confluence records. Read-only. Returns the engine's answer with its evidence and caveats.",
    description:
      'Ask one natural-language question about people, risk, impact, epics or decisions. The answer is produced by the deterministic engine — never by a language model — and carries its evidence records and caveats. ' +
      `Answerable questions include: ${ANSWERABLE_QUESTIONS.map((q) => q.example).join(' ; ')}. ` +
      'When the question cannot be mapped to the connected data, the tool says so and lists what it can answer instead of guessing. ' +
      TOOL_TRUTH_NOTE,
    input: {
      name: 'question',
      title: 'Question',
      description: 'The question, e.g. "What are the biggest knowledge risks right now?" or "What breaks if Alex leaves?"',
    },
    run: (graph, question) => answerQuery(graph, question ?? ''),
  },
];

/** Look a tool up by MCP name or Forge action key. */
export function findTool(nameOrActionKey: string): ToolSpec | undefined {
  return TRACEFLOW_TOOLS.find((t) => t.name === nameOrActionKey || t.actionKey === nameOrActionKey);
}

/**
 * Check an untrusted argument before any work is done (hosts call this before
 * reading the site, so a malformed call never costs a fan-out).
 */
export function checkToolArgument(
  tool: ToolSpec,
  rawArg: unknown,
): { ok: true; arg: string | undefined } | { ok: false; error: string } {
  if (!tool.input) return { ok: true, arg: undefined };
  const arg = typeof rawArg === 'string' ? rawArg.trim() : '';
  if (arg.length === 0) return { ok: false, error: `The "${tool.input.name}" input is required: ${tool.input.description}.` };
  if (arg.length > MAX_TOOL_ARGUMENT_LENGTH) {
    return { ok: false, error: `The "${tool.input.name}" input is too long (over ${MAX_TOOL_ARGUMENT_LENGTH} characters).` };
  }
  return { ok: true, arg };
}

/**
 * Run one tool on a graph with an untrusted argument. Never throws: a missing
 * or oversized argument, an unknown or ambiguous entity, or an engine error
 * comes back as `{ ok: false, error }` with a message the caller can relay.
 */
export function runTool(tool: ToolSpec, graph: OrgGraph, rawArg?: unknown): ToolOutcome {
  const checked = checkToolArgument(tool, rawArg);
  if (!checked.ok) return checked;
  try {
    return { ok: true, result: tool.run(graph, checked.arg) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
