import type { OrgGraph, Person, PersonRiskReport, RecordRef, RiskWeights } from './types.js';
import { getIndex } from './graph-index.js';
import { assessPersonRisk, rankPeopleByRisk } from './risk.js';
import { buildOverview, type OverviewReport } from './overview.js';
import { personImpact, type PersonImpactReport } from './impact.js';
import { traceDecision, traceEpic, type DecisionReport, type LineageReport } from './lineage.js';

/**
 * The deterministic answer layer: `answerQuery` turns a natural-language
 * question into an evidence-backed answer WITHOUT any model. It is the agent
 * backbone (the Rovo surface and the MCP `traceflow_query` tool both sit on
 * it): an LLM may rephrase `answer`, but the facts always come from
 * `data` + `evidence` produced here, and `checkGrounding` (grounding.ts)
 * verifies any rephrasing against them.
 *
 * Rules, matching the product's truth rules:
 *  - a question the engine cannot answer returns `understood: false` plus the
 *    questions it can answer — it never guesses and never pads;
 *  - every answer carries its supporting records and the caveats of the
 *    report it was rendered from;
 *  - same graph + same question → byte-identical answer (tested).
 */

export type AnswerIntent =
  | 'overview'
  | 'top-risks'
  | 'person-risk'
  | 'person-impact'
  | 'epic-lineage'
  | 'decision-trace';

export interface AnswerableQuestion {
  intent: AnswerIntent;
  example: string;
  description: string;
}

export const ANSWERABLE_QUESTIONS: readonly AnswerableQuestion[] = [
  { intent: 'overview', example: 'Give me an overview of the organization', description: 'Record counts, top risks, epics by gaps, coverage caveats' },
  { intent: 'top-risks', example: 'What are the biggest knowledge risks right now?', description: 'Everyone ranked by knowledge-risk score' },
  { intent: 'person-risk', example: 'What is the risk around Alex Rivera?', description: 'One person: findings, points, suggested actions, caveats' },
  { intent: 'person-impact', example: 'What breaks if Alex leaves?', description: 'The blast radius of one person: epics, work, pages, decisions, changes' },
  { intent: 'epic-lineage', example: 'Trace the epic PAY-1', description: 'Intent, plan, work and code records behind an epic, plus gaps' },
  { intent: 'decision-trace', example: 'What is the status of the idempotency decision?', description: 'One decision: linked work, people and roles, findings' },
];

export interface AnswerResult {
  intent: AnswerIntent;
  /** False when the engine could not map the question to an answer. */
  understood: boolean;
  question: string;
  /** Deterministic, evidence-first text. Safe to show to a user as-is. */
  answer: string;
  /** The structured report the answer was rendered from. The only data an LLM may rephrase. */
  data: unknown;
  /** Records supporting the answer. Never empty when understood. */
  evidence: RecordRef[];
  caveats: string[];
  /** Present when understood is false: the questions this engine can answer. */
  suggestions?: string[];
}

const SUGGESTIONS = ANSWERABLE_QUESTIONS.map((q) => q.example);

const list = (items: string[]): string =>
  items.length === 0 ? 'none' : items.length === 1 ? items[0]! : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;

/* ------------------------------------------------------------------ *
 * Entity detection (deterministic)
 * ------------------------------------------------------------------ */

interface PersonMatch {
  person?: Person;
  /** All people a single name-token could mean; set when person is undefined. */
  ambiguous?: Person[];
  /** A name-like word is present but matched nobody (e.g. empty graph, typo). */
  unmatchedMention?: string;
}

function matchPerson(graph: OrgGraph, question: string): PersonMatch {
  const q = question.trim();
  const lower = q.toLowerCase();

  // Exact id.
  const byId = graph.people.find((p) => p.id === q);
  if (byId) return { person: byId };

  // Exact full name (case-insensitive).
  const byName = graph.people.find((p) => p.name.toLowerCase() === lower);
  if (byName) return { person: byName };

  // Full name contained in the question.
  const contained = graph.people.filter((p) => lower.includes(p.name.toLowerCase()));
  if (contained.length === 1) return { person: contained[0]! };

  // Single name token (first or last name, or a prefix like "Sam" for "Samir"),
  // when the people it could mean are not exactly one.
  const words = lower.split(/[^a-z0-9'-]+/).filter((w) => w.length >= 3);
  const candidates = new Set<Person>();
  for (const person of graph.people) {
    const tokens = person.name.toLowerCase().split(/[^a-z0-9'-]+/).filter((w) => w.length >= 3);
    if (tokens.some((t) => words.some((w) => t === w || t.startsWith(w) || w.startsWith(t)))) {
      candidates.add(person);
    }
  }
  if (candidates.size === 1) return { person: [...candidates][0]! };
  if (candidates.size > 1) return { ambiguous: [...candidates] };

  // A name-like mention that matched nobody: a capitalized word (not the first
  // word, which is usually just the sentence start, and not a record key like
  // PAY-1 or an acronym). Reported so the engine can say "no such person"
  // instead of silently answering a different question.
  const tokens = question.split(/\s+/);
  for (const token of tokens.slice(1)) {
    const word = token.replace(/[^A-Za-z'-]/g, '');
    if (/^[A-Z][a-z']{2,}$/.test(word)) {
      return { unmatchedMention: word };
    }
  }
  return {};
}

/** Issue-key-like tokens (PAY-12) plus unique case-insensitive epic-title containment. */
function matchEpic(graph: OrgGraph, question: string): { epicId?: string; ambiguous?: boolean } {
  const index = getIndex(graph);
  const keys = question.match(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/g) ?? [];
  for (const key of keys) {
    const epic = index.workById.get(key);
    if (epic?.type === 'epic') return { epicId: epic.ref.id };
  }
  const lower = question.toLowerCase();
  const containing = index.epics.filter((e) => e.ref.title.length >= 3 && lower.includes(e.ref.title.toLowerCase()));
  if (containing.length === 1) return { epicId: containing[0]!.ref.id };
  if (containing.length > 1) return { ambiguous: true };
  return {};
}

/** Content words of a decision title (the "Decision: " prefix is noise). */
const titleWords = (title: string): string[] =>
  title
    .toLowerCase()
    .replace(/^decision:\s*/, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);

function matchDecision(graph: OrgGraph, question: string): { decisionId?: string; ambiguous?: boolean } {
  const q = question.trim().toLowerCase();
  const byId = graph.decisions.find((d) => d.ref.id.toLowerCase() === q);
  if (byId) return { decisionId: byId.ref.id };
  const byTitle = graph.decisions.find((d) => d.ref.title.toLowerCase() === q);
  if (byTitle) return { decisionId: byTitle.ref.id };
  const containing = graph.decisions.filter(
    (d) => d.ref.title.length >= 3 && q.includes(d.ref.title.toLowerCase()),
  );
  if (containing.length === 1) return { decisionId: containing[0]!.ref.id };
  if (containing.length > 1) return { ambiguous: true };
  // Significant-word match: "the idempotency decision" -> the decision whose
  // title words include 'idempotency', when exactly one does.
  const words = new Set(q.split(/[^a-z0-9]+/));
  const wordMatches = graph.decisions.filter((d) => titleWords(d.ref.title).some((w) => words.has(w)));
  if (wordMatches.length === 1) return { decisionId: wordMatches[0]!.ref.id };
  if (wordMatches.length > 1) return { ambiguous: true };
  return {};
}

/* ------------------------------------------------------------------ *
 * Intent detection (deterministic keyword rules, priority ordered)
 * ------------------------------------------------------------------ */

const IMPACT_RE = /\b(impact|blast radius|without|unavailable|leaves|leaving|left the|offboard|handover|hand-off|succession)\b/i;
const TOP_RISK_RE = /\b(biggest|largest|top|highest|riskiest|rank|ranking|at risk|risks?)\b/i;
const OVERVIEW_RE = /\b(overview|summary|health|state of|how (are|is|do|does))\b/i;
const EPIC_RE = /\b(epic|lineage)\b/i;
const DECISION_RE = /\b(decision|decisions|adr)\b/i;

/* ------------------------------------------------------------------ *
 * Answer rendering (deterministic templates)
 * ------------------------------------------------------------------ */

const cap = (refs: RecordRef[], max = 20): RecordRef[] => refs.slice(0, max);

function renderTopRisks(ranked: PersonRiskReport[]): string {
  const top = ranked.slice(0, 3);
  const intro =
    ranked.length === 0
      ? 'There are no people in the connected records, so no knowledge risk can be assessed.'
      : `${ranked.length} people were assessed. Highest knowledge-continuity risk first:`;
  const lines = top.map(
    (r) => `${r.personName} (score ${r.score}, ${r.level}: ${r.findings.map((f) => f.title.toLowerCase()).join('; ') || 'no findings'})`,
  );
  const rest = ranked.length > 3 ? ` ${ranked.length - 3} more people follow.` : '';
  return `${intro} ${lines.join('. ')}.${rest} Scores come from recorded activity only; they cannot prove who understands what.`;
}

function renderPersonRisk(report: PersonRiskReport): string {
  const findingText =
    report.findings.length === 0
      ? 'no findings from the connected records.'
      : `${report.findings.length} finding(s): ${report.findings.map((f) => f.title).join('; ')}.`;
  return (
    `${report.personName} has a knowledge-risk score of ${report.score} (${report.level}). ` +
    `${findingText} ` +
    `Suggested actions: ${list(report.findings.flatMap((f) => f.suggestedActions).slice(0, 3))}. ` +
    `Every finding lists its evidence records.`
  );
}

function renderImpact(report: PersonImpactReport): string {
  const c = report.counts;
  const parts = [
    c.stalledEpics > 0 ? `${c.stalledEpics} stalled epic(s)` : null,
    c.stalledWork > 0 ? `${c.stalledWork} un-epicked open issue(s) with no other recorded owner` : null,
    c.orphanedPages > 0 ? `${c.orphanedPages} page(s) where they are the only recorded contributor` : null,
    c.blockedDecisions > 0 ? `${c.blockedDecisions} decision(s) that lose their driver or approver` : null,
    c.unmergedChanges > 0 ? `${c.unmergedChanges} open pull request(s) that lose their author` : null,
  ].filter((p): p is string => p !== null);
  const body =
    parts.length === 0
      ? 'the connected records tie nothing to them alone: no stalled epics, no sole-contributor pages, no blocked decisions and no open pull requests.'
      : `${parts.join(', ')}.`;
  return (
    `If ${report.personName} becomes unavailable, ${body} ` +
    `This lists what the connected records show would lose an owner; knowledge shared outside Jira, Confluence and Bitbucket is not visible here.`
  );
}

function renderLineage(report: LineageReport): string {
  const lanes = new Map<string, number>();
  for (const node of report.nodes) lanes.set(node.lane, (lanes.get(node.lane) ?? 0) + 1);
  const gapText =
    report.gaps.length === 0
      ? 'no gaps were found in the recorded links.'
      : `${report.gaps.length} gap(s): ${report.gaps.map((g) => g.title.toLowerCase()).join('; ')}.`;
  return (
    `${report.epic.id} (${report.epic.title}) traces ${lanes.get('intent') ?? 0} intent record(s) ` +
    `through the epic to ${lanes.get('work') ?? 0} work item(s) and ${(lanes.get('code') ?? 0)} pull request(s). ` +
    `${gapText} ` +
    `A missing link means not found in the connected data, not that it does not exist.`
  );
}

function renderDecision(report: DecisionReport): string {
  const roles = report.people.map((p) => `${p.person.name} (${p.roles.join(', ')})`);
  const findingText =
    report.findings.length === 0 ? 'no findings.' : `${report.findings.length} finding(s): ${report.findings.map((f) => f.title.toLowerCase()).join('; ')}.`;
  return (
    `"${report.decision.title}" is ${report.status}. It links to ${report.linkedWork.length} work item(s) ` +
    `and involves ${report.people.length} people: ${list(roles)}. ${findingText}`
  );
}

function renderOverview(report: OverviewReport): string {
  const c = report.counts;
  const top = report.topPeople[0];
  const topText = top ? `The highest knowledge risk is ${top.personName} (score ${top.score}, ${top.level}).` : 'No people are connected, so no person risk is assessed.';
  const gappiest = report.epics[0];
  const epicText = gappiest && gappiest.gaps > 0 ? ` The epic with the most recorded gaps is ${gappiest.epic.id} (${gappiest.gaps} gap(s), ${gappiest.openWork} open item(s)).` : '';
  return (
    `The connected records hold ${c.people} people, ${c.epics} epics, ${c.openWorkItems} open work items, ` +
    `${c.soleContributorPages} sole-contributor page(s), ${c.pendingDecisions} decision(s) still waiting on an approver and ` +
    `${c.openPullRequests} open pull request(s). ${topText}${epicText} ` +
    `Counts describe the connected Jira, Confluence and Bitbucket records only.`
  );
}

/* ------------------------------------------------------------------ *
 * The public entry point
 * ------------------------------------------------------------------ */

export function answerQuery(graph: OrgGraph, question: string, weights?: RiskWeights): AnswerResult {
  const q = question.trim();
  const base = { question: q };

  const personMatch = matchPerson(graph, q);
  const epicMatch = matchEpic(graph, q);
  const decisionMatch = matchDecision(graph, q);

  const wantsImpact = IMPACT_RE.test(q);
  const wantsTop = TOP_RISK_RE.test(q);
  const wantsOverview = OVERVIEW_RE.test(q);
  const wantsEpic = EPIC_RE.test(q);
  const wantsDecision = DECISION_RE.test(q);

  const notUnderstood = (answer: string, extraSuggestions?: string[]): AnswerResult => ({
    ...base,
    intent: 'overview',
    understood: false,
    answer,
    data: null,
    evidence: [],
    caveats: [],
    suggestions: extraSuggestions ? [...extraSuggestions, ...SUGGESTIONS] : SUGGESTIONS,
  });

  // Ambiguous person mention: ask which one, unless an epic or decision was
  // matched (then the person word was probably part of the title).
  if (!personMatch.person && personMatch.ambiguous && !epicMatch.epicId && !decisionMatch.decisionId) {
    return notUnderstood(
      `That could mean ${list(personMatch.ambiguous.map((p) => p.name))}. Please use the full name or the id (${personMatch.ambiguous.map((p) => p.id).join(', ')}).`,
    );
  }
  // A name-like mention that matched nobody: say so instead of silently
  // answering a different question (ranking, overview) the user did not ask.
  if (
    !personMatch.person &&
    !personMatch.ambiguous &&
    personMatch.unmatchedMention &&
    !epicMatch.epicId &&
    !decisionMatch.decisionId
  ) {
    const known = graph.people.map((p) => `${p.name} (${p.id})`).join(', ') || 'none';
    return notUnderstood(
      graph.people.length === 0
        ? 'There are no people in the connected records, so no person risk can be assessed.'
        : `No person matching '${personMatch.unmatchedMention}' exists in the connected data. Known people: ${known}.`,
    );
  }
  if (epicMatch.ambiguous && wantsEpic) {
    return notUnderstood('That matches more than one epic. Please use the epic key, for example PAY-1.');
  }
  if (decisionMatch.ambiguous && wantsDecision) {
    return notUnderstood('That matches more than one decision. Please use the exact title or id.');
  }

  const person = personMatch.person;

  // 1. Person impact: person + impact words.
  if (person && wantsImpact) {
    const report = personImpact(graph, person.id);
    return {
      ...base,
      intent: 'person-impact',
      understood: true,
      answer: renderImpact(report),
      data: report,
      evidence: cap(report.areas.flatMap((a) => a.evidence)),
      caveats: report.caveats,
    };
  }

  // 2. Person risk: a person was mentioned (risk words, or no other intent wins).
  if (person) {
    const report = assessPersonRisk(graph, person.id, weights);
    return {
      ...base,
      intent: 'person-risk',
      understood: true,
      answer: renderPersonRisk(report),
      data: report,
      evidence: cap(report.findings.flatMap((f) => f.evidence)),
      caveats: report.caveats,
    };
  }

  // 3. Epic lineage.
  if (epicMatch.epicId) {
    const report = traceEpic(graph, epicMatch.epicId);
    return {
      ...base,
      intent: 'epic-lineage',
      understood: true,
      answer: renderLineage(report),
      data: report,
      evidence: cap(report.nodes.map((n) => n.ref)),
      caveats: report.caveats,
    };
  }

  // 4. Decision trace.
  if (decisionMatch.decisionId) {
    const report = traceDecision(graph, decisionMatch.decisionId);
    return {
      ...base,
      intent: 'decision-trace',
      understood: true,
      answer: renderDecision(report),
      data: report,
      evidence: cap([report.decision, ...report.linkedWork]),
      caveats: report.caveats,
    };
  }

  // 5. Top risks.
  if (wantsTop) {
    const ranked = rankPeopleByRisk(graph, weights);
    return {
      ...base,
      intent: 'top-risks',
      understood: true,
      answer: renderTopRisks(ranked),
      data: ranked,
      evidence: cap(ranked.flatMap((r) => r.findings.flatMap((f) => f.evidence))),
      caveats: ['Scores come from recorded activity only; they cannot prove who understands what.'],
    };
  }

  // 6. Overview.
  if (wantsOverview) {
    const report = buildOverview(graph, weights);
    return {
      ...base,
      intent: 'overview',
      understood: true,
      answer: renderOverview(report),
      data: report,
      evidence: cap(report.epics.map((e) => e.epic)),
      caveats: report.caveats,
    };
  }

  return notUnderstood(
    'The engine could not map that question to the connected records. It answers questions about people, risk, impact, epics and decisions — and says so when it cannot.',
  );
}
