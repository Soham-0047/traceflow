import type { Decision, OrgGraph, PersonRiskReport, RecordRef, RiskWeights, WorkItem } from './types.js';
import { assessPersonRisk, rankPeopleByRisk } from './risk.js';
import { buildOverview, type OverviewReport } from './overview.js';
import { getIndex } from './graph-index.js';
import {
  personImpact,
  epicImpact,
  decisionImpact,
  type PersonImpactReport,
  type EpicImpactReport,
  type DecisionImpactReport,
} from './impact.js';
import { traceDecision, traceEpic, type DecisionReport, type LineageReport } from './lineage.js';
import {
  matchPerson,
  matchEpic,
  matchDecision,
  type PersonMatch,
} from './matcher.js';
import {
  scoreIntents,
  impactSignal,
  rankingSignal,
  rankingStrong,
  arbitrateFreeQuestion,
} from './intent.js';
import { tokenSimilarity } from './text.js';

/**
 * The deterministic answer layer: `answerQuery` turns a natural-language
 * question into an evidence-backed answer WITHOUT any model. It is the agent
 * backbone (the Rovo surface and the MCP `traceflow_query` tool both sit on
 * it): an LLM may rephrase `answer`, but the facts always come from
 * `data` + `evidence` produced here, and `checkGrounding` (grounding.ts)
 * verifies any rephrasing against them.
 *
 * Understanding runs on the in-house NLU (no model, no network):
 *  - `matcher.ts` resolves WHICH person, epic or decision the question names,
 *    tolerating typos, reordered words and partial names, with ambiguity
 *    reported instead of guessed;
 *  - `intent.ts` scores WHAT is being asked (blast radius, ranking, overview,
 *    trace) as a weighted sum of word signals.
 *  The measured understanding efficiency of this layer is evaluated by
 * `eval.ts` (a labeled corpus) and gated in CI at 88% or better.
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
  | 'epic-impact'
  | 'decision-trace'
  | 'decision-impact';

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
  { intent: 'epic-impact', example: 'What breaks if the Payments reliability epic changes?', description: 'The blast radius of a changed epic: open work, stale specs, unreviewed changes, who needs to know' },
  { intent: 'decision-trace', example: 'What is the status of the idempotency decision?', description: 'One decision: linked work, people and roles, findings' },
  { intent: 'decision-impact', example: 'What happens if the idempotency key scope decision changes?', description: 'The blast radius of a changed decision: outdated work, outdated changes, who needs to know' },
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

/* ------------------------------------------------------------------ *
 * Command guard: a request to DO something is not a question about the
 * connected records. "book a meeting with priya" names a person, so
 * without this gate the engine would happily answer her risk profile —
 * confidently wrong. The patterns are deliberately tight noun objects
 * (book/schedule + a meeting word; send/write/draft + a message word)
 * plus can/could-you and please openers with contact verbs: "send me the
 * top risks" stays a ranking question, "send an email to priya" refuses.
 * ------------------------------------------------------------------ */

const COMMAND_PATTERNS: RegExp[] = [
  /\b(?:book|schedule|reschedule)\s+(?:an?\s+|the\s+|my\s+|our\s+)?(?:meeting|meetings|1:1|one-on-one|1-1|sync|standup|stand-up|retro|retrospective|calendar|invite|invites|interview)\b/i,
  /\b(?:send|write|draft|forward)\s+(?:an?\s+|the\s+|my\s+|our\s+)?(?:message|messages|email|e-mail|dm|reminder|memo|slack)\b/i,
  /\b(?:can|could)\s+(?:you|we|i)\s+(?:ping|message|email|call|text|invite|remind|book|schedule)\b/i,
  /\bplease\s+(?:ping|message|email|call|text|invite|remind|book|schedule)\b/i,
  // "keep alex in the loop on the payments work" is a notification request,
  // not a who-needs-to-know question: without this gate the engine answers
  // Alex's risk profile (session 12 probe caught exactly that). The
  // imperative "keep" opens the sentence — optionally after "please" or
  // "can/could you" — so anchoring on the start refuses the request while
  // the question forms keep their route: "who needs to be in the loop on
  // the payments work?" and "who should we keep in the loop?" both lead
  // with a wh-word, not the imperative.
  /^(?:please\s+)?keep\s+[^.?!]{0,40}?\bin\s+the\s+loop\b/i,
  /^(?:can|could)\s+you\s+keep\s+[^.?!]{0,40}?\bin\s+the\s+loop\b/i,
];

/** True when the input is a request to perform an action, not a question the engine can answer. */
export function isCommandRequest(question: string): boolean {
  return COMMAND_PATTERNS.some((re) => re.test(question));
}

/* ------------------------------------------------------------------ *
 * Did-you-mean: rank the answerable questions by how close the user's
 * wording is to each. A miss that names a person surfaces the person
 * questions first; impact wording surfaces the blast-radius questions;
 * otherwise token-set similarity decides. Deterministic: ties keep the
 * catalog order, so the same miss always suggests the same order.
 * ------------------------------------------------------------------ */

export interface SuggestionContext {
  person?: boolean;
  epic?: boolean;
  decision?: boolean;
}

export function rankSuggestions(question: string, matched: SuggestionContext = {}): string[] {
  const scores = scoreIntents(question);
  const wantsImpact = impactSignal(scores);
  const wantsRanking = rankingSignal(scores);
  return ANSWERABLE_QUESTIONS.map((candidate, i) => {
    let score = tokenSimilarity(question, candidate.example);
    if (wantsImpact && candidate.intent.endsWith('-impact')) score += 1;
    if (wantsRanking && candidate.intent === 'top-risks') score += 1;
    if (scores.overview >= 2 && candidate.intent === 'overview') score += 1;
    if (matched.person && candidate.intent.startsWith('person-')) score += 1.5;
    if (matched.epic && candidate.intent.startsWith('epic-')) score += 1.5;
    if (matched.decision && candidate.intent.startsWith('decision-')) score += 1.5;
    return { example: candidate.example, i, score };
  })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((s) => s.example);
}

const list = (items: string[]): string =>
  items.length === 0 ? 'none' : items.length === 1 ? items[0]! : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;

/* ------------------------------------------------------------------ *
 * Decision scope join (session 11): a decision question that names an
 * epic's work but no decision title — "which decision is blocking the
 * payments work?" The wording places the question in the decision domain,
 * so instead of falling through to the epic's lineage (a different question
 * than asked), the engine resolves the candidates through the recorded
 * links — the SAME linkage traceDecision uses, so the trace and the join
 * agree by construction: the decisions linked to that epic's open work
 * whose status can block it (proposed with outstanding approvers, or
 * superseded). Exactly one → trace it; several → name them and ask which;
 * none → say so, informed. Deterministic: candidates in canonical id order.
 * ------------------------------------------------------------------ */

function decisionsBlockingEpicWork(graph: OrgGraph, epicId: string): Decision[] {
  const index = getIndex(graph);
  const candidates: Decision[] = [];
  for (const decision of graph.decisions) {
    if (decision.status !== 'proposed' && decision.status !== 'superseded') continue;
    // The same linkage traceDecision uses, both directions: work whose remote
    // links point at the decision page, plus work the decision names directly.
    const linked = new Map<string, WorkItem>();
    for (const item of index.workByLinkedPageId.get(decision.ref.id) ?? []) {
      linked.set(item.ref.id, item);
    }
    for (const wid of decision.linkedWorkItemIds ?? []) {
      const item = index.workById.get(wid);
      if (item) linked.set(item.ref.id, item);
    }
    const blocks = [...linked.values()].some((w) => w.epicId === epicId && w.status === 'open');
    if (blocks) candidates.push(decision);
  }
  return candidates.sort((a, b) => a.ref.id.localeCompare(b.ref.id));
}

function describeJoinedDecision(graph: OrgGraph, decision: Decision): string {
  const index = getIndex(graph);
  const title = decision.ref.title.replace(/^decision:\s*/i, '');
  if (decision.status === 'superseded') return `${decision.ref.id} '${title}' (superseded)`;
  const approvers = decision.pendingApproverIds
    .map((id) => index.peopleById.get(id)?.name ?? id)
    .join(', ');
  const waiting = approvers.length > 0 ? `, waiting on ${approvers}` : '';
  return `${decision.ref.id} '${title}' (proposed${waiting})`;
}

/* ------------------------------------------------------------------ *
 * Entity detection and intent scoring live in the in-house NLU:
 *  - matcher.ts (people, epics, decisions: typo-tolerant, ambiguity-aware)
 *  - intent.ts  (weighted word-signal scores per intent)
 * ------------------------------------------------------------------ */

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

function renderEpicImpact(report: EpicImpactReport): string {
  const c = report.counts;
  const parts = [
    c.orphanedWork > 0 ? `${c.orphanedWork} open issue(s) that lose their recorded plan` : null,
    c.staleSpecs > 0 ? `${c.staleSpecs} linked page(s) or decision(s) worth re-checking` : null,
    c.unreviewedChanges > 0 ? `${c.unreviewedChanges} open pull request(s) that may implement outdated intent` : null,
  ].filter((p): p is string => p !== null);
  const body =
    parts.length === 0
      ? 'the connected records tie no open work, linked specifications or open changes to it.'
      : `${parts.join(', ')}.`;
  const gapText =
    report.gaps.length === 0
      ? ' No gaps were found in its recorded links.'
      : ` It already has ${report.gaps.length} recorded gap(s): ${report.gaps.map((g) => g.title.toLowerCase()).join('; ')}.`;
  const who =
    report.people.length === 0
      ? ' No person is tied to it through the connected records.'
      : ` ${report.people.length} person(s) are tied to it through records: ${list(report.people.map((p) => `${p.person.name} (${p.roles.join(', ')})`))}.`;
  return (
    `If ${report.epic.title} (${report.epic.id}) changes, ${body}${gapText}${who} ` +
    `Impact assumes a change of scope or cancellation; the records cannot show which parts would actually change.`
  );
}

function renderDecisionImpact(report: DecisionImpactReport): string {
  const c = report.counts;
  const parts = [
    c.outdatedWork > 0 ? `${c.outdatedWork} open issue(s) that must be reviewed against the new decision` : null,
    c.outdatedChanges > 0 ? `${c.outdatedChanges} open pull request(s) that may implement the wrong intent` : null,
  ].filter((p): p is string => p !== null);
  const body =
    parts.length === 0
      ? 'the connected records tie no open work or open changes to it.'
      : `${parts.join(', ')}.`;
  const who =
    report.people.length === 0
      ? ' No person is tied to it through the connected records.'
      : ` ${report.people.length} person(s) are tied to it through records: ${list(report.people.map((p) => `${p.person.name} (${p.roles.join(', ')})`))}.`;
  return (
    `"${report.decision.title}" is currently ${report.status}. If it is superseded or reversed, ${body}${who} ` +
    `Impact assumes a change to the decision; the records cannot show which conclusions would actually change.`
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

  // The honest-miss payload. Suggestions are passed in explicitly: the
  // command guard ranks by wording alone, later misses rank by wording plus
  // the entities the question managed to name, and the generic miss keeps
  // the catalog order (nothing to rank by, and a stable order scans better).
  const notUnderstood = (answer: string, suggestions: string[]): AnswerResult => ({
    ...base,
    intent: 'overview',
    understood: false,
    answer,
    data: null,
    evidence: [],
    caveats: [],
    suggestions,
  });

  // A command ("book a meeting with alex") is refused before any entity
  // matching: naming a person inside a scheduling request must not produce
  // that person's risk profile.
  if (isCommandRequest(q)) {
    return notUnderstood(
      'This looks like a request to schedule or send something, which the engine cannot do. It answers questions about people, risk, impact, epics and decisions from the connected records.',
      rankSuggestions(q),
    );
  }

  const personMatch: PersonMatch = matchPerson(graph, q);
  const epicMatch = matchEpic(graph, q);
  const decisionMatch = matchDecision(graph, q);

  const scores = scoreIntents(q);
  const wantsImpact = impactSignal(scores);
  const wantsTop = rankingSignal(scores);

  // Which entities the question managed to name — drives did-you-mean order.
  // An unmatched mention ("risk around Zed") still names a person shape, so
  // it lifts the person questions: the closest re-ask is a person question.
  const named: SuggestionContext = {
    person:
      personMatch.person !== undefined ||
      personMatch.ambiguous !== undefined ||
      personMatch.unmatchedMention !== undefined,
    epic: epicMatch.epicId !== undefined || epicMatch.ambiguous === true,
    decision: decisionMatch.decisionId !== undefined || decisionMatch.ambiguous === true,
  };
  const rankedSuggestions = rankSuggestions(q, named);

  // Ambiguous person mention: ask which one, unless an epic or decision was
  // matched (then the person word was probably part of the title).
  if (!personMatch.person && personMatch.ambiguous && !epicMatch.epicId && !decisionMatch.decisionId) {
    return notUnderstood(
      `That could mean ${list(personMatch.ambiguous.map((p) => p.name))}. Please use the full name or the id (${personMatch.ambiguous.map((p) => p.id).join(', ')}).`,
      rankedSuggestions,
    );
  }
  // A name-like mention that matched nobody: say so instead of silently
  // answering a different question (ranking, overview) the user did not ask.
  // Exception: a strongly-scored ranking question ("Who is our Single Point
  // of Failure?") may capitalize a phrase mid-sentence — that is emphasis,
  // not a person, so the ranking wins over the name heuristic.
  if (
    !personMatch.person &&
    !personMatch.ambiguous &&
    personMatch.unmatchedMention &&
    !rankingStrong(scores) &&
    !epicMatch.epicId &&
    !decisionMatch.decisionId
  ) {
    const known = graph.people.map((p) => `${p.name} (${p.id})`).join(', ') || 'none';
    return notUnderstood(
      graph.people.length === 0
        ? 'There are no people in the connected records, so no person risk can be assessed.'
        : `No person matching '${personMatch.unmatchedMention}' exists in the connected data. Known people: ${known}.`,
      rankedSuggestions,
    );
  }
  if (epicMatch.ambiguous && scores.epic >= 2) {
    return notUnderstood('That matches more than one epic. Please use the epic key, for example PAY-1.', rankedSuggestions);
  }
  if (decisionMatch.ambiguous && scores.decision >= 2) {
    return notUnderstood('That matches more than one decision. Please use the exact title or id.', rankedSuggestions);
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

  // 2.5 Decision scope join: a decision question naming an epic's work but no
  // decision title ("which decision is blocking the payments work?", "what did
  // we decide about the payments work?"). Runs before the epic rules: the
  // question is in the decision domain, so the epic's lineage or impact would
  // answer a different question than the one asked. Skipped when impact or
  // ranking wording is present — those route to the epic's blast radius, and
  // a lexically matched decision always wins (checked above).
  if (
    !decisionMatch.decisionId &&
    !decisionMatch.ambiguous &&
    epicMatch.epicId &&
    scores.decision >= 2 &&
    !wantsImpact &&
    !wantsTop
  ) {
    const epic = getIndex(graph).workById.get(epicMatch.epicId);
    const epicName = epic ? `${epic.ref.title} (${epic.ref.id})` : epicMatch.epicId;
    const candidates = decisionsBlockingEpicWork(graph, epicMatch.epicId);
    if (candidates.length === 1) {
      const report = traceDecision(graph, candidates[0]!.ref.id);
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
    if (candidates.length > 1) {
      return notUnderstood(
        `That names more than one decision. ${candidates.length} decisions are proposed or superseded against work in ${epicName}: ` +
          `${list(candidates.map((d) => describeJoinedDecision(graph, d)))}. ` +
          `Name the decision you mean and the engine will trace it.`,
        rankedSuggestions,
      );
    }
    return notUnderstood(
      `No decision is linked to work in ${epicName} in the connected records, so no decision can be blocking it. ` +
        `If a decision exists, it is not linked to that work yet.`,
      rankedSuggestions,
    );
  }

  // 3. Epic impact: an epic was matched and the question is about what a change to it affects.
  if (epicMatch.epicId && (wantsImpact || wantsTop)) {
    const report = epicImpact(graph, epicMatch.epicId);
    return {
      ...base,
      intent: 'epic-impact',
      understood: true,
      answer: renderEpicImpact(report),
      data: report,
      evidence: cap(report.areas.flatMap((a) => a.evidence)),
      caveats: report.caveats,
    };
  }

  // 4. Epic lineage.
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

  // 5. Decision impact: a decision was matched and the question is about what a change to it affects.
  if (decisionMatch.decisionId && wantsImpact) {
    const report = decisionImpact(graph, decisionMatch.decisionId);
    return {
      ...base,
      intent: 'decision-impact',
      understood: true,
      answer: renderDecisionImpact(report),
      data: report,
      evidence: cap(report.areas.flatMap((a) => a.evidence)),
      caveats: report.caveats,
    };
  }

  // 6. Decision trace.
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

  // 7-8. No entity: the free-question arbitration (ranking or overview).
  const free = arbitrateFreeQuestion(scores);
  if (free === 'top-risks') {
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
  if (free === 'overview') {
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
    // Ranked like the other misses: wording signals (impact, ranking,
    // overview) and any named entities lift the closest examples first, and
    // with no signal at all the stable sort keeps the catalog order.
    rankedSuggestions,
  );
}
