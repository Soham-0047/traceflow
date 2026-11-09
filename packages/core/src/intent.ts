/**
 * The intent layer of the in-house NLU: a weighted bag-of-signals scorer that
 * replaces first-match-wins regex dispatch. Every signal is a fixed-weight
 * word pattern; the score of an intent is the sum of the weights of its
 * matched signals. Pure function of the question, so arbitration is
 * deterministic and explainable — each score can be printed as "which words
 * fired, with which weights".
 *
 * The answer layer (query.ts) combines these scores with the entity match:
 * the entity decides the subject (person, epic, decision), the scores decide
 * the question shape (blast radius, ranking, overview, trace).
 */

export interface IntentScores {
  /** "What breaks if X leaves / changes / is superseded?" */
  impact: number;
  /** "Biggest / top / ranked risks?" */
  topRisks: number;
  /** "Overview / summary / how are we doing?" */
  overview: number;
  /** Domain words: epic, lineage, trace. */
  epic: number;
  /** Domain words: decision, ADR, status. */
  decision: number;
}

interface Signal {
  /** Matches the question (case-insensitive, word boundaries). */
  re: RegExp;
  /** Weight: strong signals dominate, weak signals only tip close calls. */
  weight: number;
}

const IMPACT: Signal[] = [
  { re: /\bblast radius\b/i, weight: 3 },
  { re: /\bwhat (?:breaks|happens|do (?:we|you) lose)\b/i, weight: 3 },
  { re: /\bif\b[^.?!]{0,48}\b(?:leaves|leaving|left|departs|quits|resigns|retires|is unavailable|becomes unavailable|got hit|gets hit|changes|changed|is cancelled|is canceled|gets cancelled|gets canceled|is reversed|gets reversed|is superseded|gets superseded|is descoped|gets descoped|is dropped|gets dropped)\b/i, weight: 3 },
  { re: /\b(?:before|when)\s+(?:he|she|they)\s+(?:leaves?|left|goes|quit|quits|resigns?)\b/i, weight: 3 },
  { re: /\b(?:hit by a bus|bus factor)\b/i, weight: 3 },
  { re: /\b(?:offboard(?:ing|s)?|handover|hand-off|handoff|succession)\b/i, weight: 3 },
  { re: /\bimpact\b/i, weight: 2 },
  { re: /\b(?:without|unavailable|loses?|losing)\b/i, weight: 2 },
  { re: /\b(?:breaks?|stalls?|blocked|orphaned?)\b/i, weight: 2 },
  // Change-verbs as actions ("we cancel", "superseding", "plan to reverse") —
  // but NOT past participles used as state ("the decision is superseded"),
  // which describe how things are, not a hypothetical change.
  { re: /\b(?:cancel|supersede|reverse|descope)(?:s|ing)?\b|\b(?:cancelling|canceling|superseding|reversing|descoping)\b/i, weight: 2 },
  { re: /\bchang(?:e|es|ed|ing)\b/i, weight: 2 },
  { re: /\bdepend(?:s|ent|ents|ency|encies)?\b/i, weight: 2 },
  { re: /\bwhat if\b/i, weight: 1 },
  { re: /\baffected\b/i, weight: 1 },
];

const TOP_RISKS: Signal[] = [
  { re: /\b(?:biggest|largest|top|highest|riskiest|worst|main)\s+(?:knowledge(?:-|\s)continuity\s+)?risks?\b/i, weight: 3 },
  { re: /\b(?:most|more)\s+at\s+risk\b/i, weight: 3 },
  { re: /\briskiest\b/i, weight: 3 },
  { re: /\bbus factor\b/i, weight: 3 },
  { re: /\bat\s+risk\b/i, weight: 2 },
  { re: /\brisks?\b|\bexposure\b/i, weight: 2 },
  { re: /\brank(?:ed|ing|s)?\b/i, weight: 1 },
  { re: /\bwho (?:is|are|should|was|do)\b/i, weight: 1 },
  { re: /\b(?:worry|worried|concern(?:ed|s)?)\b/i, weight: 1 },
];

const OVERVIEW: Signal[] = [
  { re: /\boverview\b/i, weight: 3 },
  // Weight 2, not 3: "summary of the risks" must lose the tie to the ranking,
  // because risk is the subject of the question, not the org overview.
  { re: /\bsummar(?:y|ize|ise|ise it)\b/i, weight: 2 },
  { re: /\bsnapshot\b/i, weight: 2 },
  { re: /\bbig picture\b/i, weight: 2 },
  { re: /\bstate of\b/i, weight: 2 },
  { re: /\bhealth(?:y)?\b/i, weight: 2 },
  { re: /\bhow are (?:we|things|you|they|people|everyone)\b/i, weight: 2 },
  { re: /\bhow is (?:the|our|it|this|everything|everyone)\b/i, weight: 2 },
  { re: /\b(?:overall|organization|organisation|org|landscape|dashboard)\b/i, weight: 1 },
  { re: /\btell me about the (?:team|org|organization|organisation)\b/i, weight: 2 },
];

const EPIC: Signal[] = [
  { re: /\bepics?\b/i, weight: 2 },
  { re: /\blineage\b/i, weight: 2 },
  { re: /\b(?:trace|behind)\b/i, weight: 1 },
];

const DECISION: Signal[] = [
  { re: /\bdecisions?\b/i, weight: 2 },
  { re: /\badrs?\b/i, weight: 2 },
  { re: /\bstatus\b/i, weight: 1 },
];

function sum(signals: Signal[], question: string): number {
  let score = 0;
  for (const { re, weight } of signals) {
    if (re.test(question)) score += weight;
  }
  return score;
}

/** Weighted intent scores for one question. Deterministic, order-free. */
export function scoreIntents(question: string): IntentScores {
  return {
    impact: sum(IMPACT, question),
    topRisks: sum(TOP_RISKS, question),
    overview: sum(OVERVIEW, question),
    epic: sum(EPIC, question),
    decision: sum(DECISION, question),
  };
}

/**
 * Arbitration thresholds, shared with the answer layer:
 *  - `impactStrong` means the question clearly asks for a blast radius;
 *  - `impactSignal` means any impact wording is present;
 *  - `rankingStrong` means the question clearly asks for a ranking.
 */
export const impactStrong = (s: IntentScores): boolean => s.impact >= 3;
export const impactSignal = (s: IntentScores): boolean => s.impact >= 2;
export const rankingSignal = (s: IntentScores): boolean => s.topRisks >= 2;
export const rankingStrong = (s: IntentScores): boolean => s.topRisks >= 3;

/**
 * No-entity arbitration: which answerable intent a question with no matched
 * person, epic or decision maps to. `undefined` = not understood (the engine
 * then says so honestly, with suggestions). On a tie the ranking wins: risk
 * is the product's subject.
 */
export function arbitrateFreeQuestion(s: IntentScores): 'top-risks' | 'overview' | undefined {
  if (rankingSignal(s) && s.topRisks >= s.overview) return 'top-risks';
  if (s.overview >= 2) return 'overview';
  return undefined;
}
