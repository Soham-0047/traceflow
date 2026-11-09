import type { Decision, OrgGraph, Person, WorkItem } from './types.js';
import { getIndex } from './graph-index.js';
import { normalize, tokens, typoBudget, editDistance, inflectionalMatch } from './text.js';

/**
 * The fuzzy entity layer of the in-house NLU: turns a natural-language
 * question into the person, epic or decision it names — tolerating typos,
 * word reordering and partial names — while staying deterministic and
 * honest:
 *
 *  - every lane has a fixed score and candidates are ranked by (score desc,
 *    id asc), so the same question over the same graph always picks the same
 *    entity regardless of record order (the e2e determinism stage asserts it);
 *  - two candidates within `AMBIGUITY_MARGIN` of each other are reported as
 *    ambiguous instead of guessed ("Sam" with Sam Chen and Samir Gupta);
 *  - weak single-word lanes only fire when the word is distinctive in the
 *    graph AND the question carries a domain word ("trace the auth epic"),
 *    so "tell me about the auth service runbook" matches nobody.
 */

export interface ScoredCandidate<T> {
  item: T;
  score: number;
}

/** Top candidates closer than this are treated as ambiguous. */
export const AMBIGUITY_MARGIN = 0.1;

/** Candidates must score at least this to be considered at all. */
const MIN_SCORE = 0.55;

/* ------------------------------------------------------------------ *
 * The shared matcher index: the token structures every question needs —
 * name-token holders for people, title tokens and distinctive-token sets
 * for epics and decisions — computed once per graph and reused, exactly
 * like the engine's GraphIndex. Before this cache, every question
 * re-tokenized every record title and re-counted distinctiveness across
 * all of them; on a 250-epic org that was the bulk of the per-question
 * matcher cost. Graphs are immutable by contract, so the cached structures
 * can never drift from the data.
 * ------------------------------------------------------------------ */

interface RecordTokens {
  id: string;
  titleTokens: string[];
  titleLower: string;
}

interface MatcherIndex {
  /** Each person-name content token -> the people sharing it (distinctiveness). */
  personTokenHolders: Map<string, Set<Person>>;
  epicRecords: RecordTokens[];
  epicDistinctive: Set<string>[];
  decisionRecords: RecordTokens[];
  decisionDistinctive: Set<string>[];
}

const MATCHER_CACHE = new WeakMap<OrgGraph, MatcherIndex>();

function buildMatcherIndex(graph: OrgGraph): MatcherIndex {
  const personTokenHolders = new Map<string, Set<Person>>();
  for (const person of graph.people) {
    for (const token of personNameTokens(person)) {
      const holders = personTokenHolders.get(token) ?? new Set<Person>();
      holders.add(person);
      personTokenHolders.set(token, holders);
    }
  }

  const epicRecords = getIndex(graph).epics.map((epic) => ({
    id: epic.ref.id,
    titleTokens: titleTokens(epic.ref.title),
    titleLower: normalize(epic.ref.title),
  }));
  const decisionRecords = graph.decisions.map((decision: Decision) => ({
    id: decision.ref.id,
    titleTokens: titleTokens(decision.ref.title),
    titleLower: normalize(decision.ref.title.replace(/^decision:\s*/i, '')),
  }));

  return {
    personTokenHolders,
    epicRecords,
    epicDistinctive: distinctiveTokens(epicRecords.map((r) => r.titleTokens)),
    decisionRecords,
    decisionDistinctive: distinctiveTokens(decisionRecords.map((r) => r.titleTokens)),
  };
}

function getMatcherIndex(graph: OrgGraph): MatcherIndex {
  const cached = MATCHER_CACHE.get(graph);
  if (cached) return cached;
  const index = buildMatcherIndex(graph);
  MATCHER_CACHE.set(graph, index);
  return index;
}

function rank<T>(
  candidates: ScoredCandidate<T>[],
  keyOf: (item: T) => string,
): ScoredCandidate<T>[] {
  return candidates
    .filter((c) => c.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || keyOf(a.item).localeCompare(keyOf(b.item)));
}

/** The leader plus everyone tied within the ambiguity margin. */
function tiedLeaders<T>(ranked: ScoredCandidate<T>[]): ScoredCandidate<T>[] {
  const top = ranked[0]!.score;
  return ranked.filter((c) => top - c.score <= AMBIGUITY_MARGIN);
}

/**
 * Dash-preserving words of a question, lowercased: record ids like "PAY-1"
 * and "acc-12" survive here (the content tokenizer would split them).
 */
function rawWords(question: string): string[] {
  return question
    .split(/[^A-Za-z0-9-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase());
}

/** True when one token is a prefix of the other (both at least 3 chars). */
function prefixMatch(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Name-token equality: exact, inflectional (singular/plural), prefix, or
 * within the typo budget — with one exception: a 3-character query token
 * may sit 1 edit from a longer name token ("alx" -> "alex").
 * Three-character words get no general fuzzy budget ("sam" vs "sat" are
 * different words), but a 3-letter fragment next to a 4+ letter name is
 * almost always a truncated or mistyped name.
 *
 * The inflectional lane (text.ts `inflectionalMatch`) is what lets
 * "the retry mechanism" anchor the "queue vs cron for retries" decision:
 * "retry" -> "retries" is a y->ies plural, three edits apart — beyond every
 * typo budget — yet the same word to any reader.
 */
function nameTokenMatches(word: string, candidate: string): boolean {
  if (word === candidate) return true;
  if (inflectionalMatch(word, candidate)) return true;
  if (prefixMatch(word, candidate)) return true;
  const shortFragment = word.length === 3 && candidate.length >= 4 ? 1 : 0;
  const budget = Math.max(Math.min(typoBudget(word), typoBudget(candidate)), shortFragment);
  if (budget === 0) return false;
  return editDistance(word, candidate, budget) <= budget;
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

export interface PersonMatch {
  person?: Person;
  /** All people the mention could mean; set when person is undefined. */
  ambiguous?: Person[];
  /** A name-like word is present but matched nobody (typo, empty graph). */
  unmatchedMention?: string;
}

/** Lowercased content tokens of a person's name, e.g. "Alex Rivera" -> alex, rivera. */
function personNameTokens(person: Person): string[] {
  return tokens(person.name);
}

/**
 * Match a person mentioned in a question. Lanes, strongest first (a person
 * can hit several lanes; the best one wins):
 *  1.00 the whole question is the person id;
 *  0.95 the full name appears in the question;
 *  0.90+ every name token appears (typo-tolerant, any order) — "rivera alex";
 *  0.80 the id appears as a bare word ("about alex") — above the single-token
 *        lanes but below full-name evidence, so a first-name-plus-someone-
 *        else's-surname question stays ambiguous instead of silently winning;
 *  0.75 one distinctive name token — "rivera", "priya" — when unique;
 *  0.60 any single name token when only one person matches it.
 */
export function matchPerson(graph: OrgGraph, question: string): PersonMatch {
  const q = question.trim();
  const lower = normalize(q);
  const qTokens = tokens(q);
  const words = new Set(rawWords(q));

  // Uniqueness of each name token across people, for the distinctive lane.
  const tokenHolders = getMatcherIndex(graph).personTokenHolders;

  const scored: ScoredCandidate<Person>[] = [];
  for (const person of graph.people) {
    if (q === person.id) {
      scored.push({ item: person, score: 1 });
      continue;
    }
    const nameTokens = personNameTokens(person);
    const idWord = person.id.toLowerCase();
    let score = 0;

    if (lower.includes(normalize(person.name))) score = 0.95;
    else {
      if (words.has(idWord) && idWord.length >= 3) score = 0.8;
      const matched = nameTokens.filter((t) => qTokens.some((w) => nameTokenMatches(w, t)));
      const allMatched = nameTokens.length > 0 && matched.length === nameTokens.length;
      if (allMatched) {
        const exact = nameTokens.filter((t) => qTokens.includes(t)).length;
        score = Math.max(score, 0.9 + 0.02 * Math.min(exact, 2));
      } else if (matched.length > 0) {
        // Single-token lanes: distinctive when unique, weak otherwise.
        const distinctive = matched.some((t) => tokenHolders.get(t)?.size === 1);
        score = Math.max(score, distinctive ? 0.75 : 0.6);
      }
    }

    if (score > 0) scored.push({ item: person, score });
  }

  const ranked = rank(scored, (p) => p.id);
  if (ranked.length === 0) return unmatchedPersonMention(question);
  const leaders = tiedLeaders(ranked);
  if (leaders.length > 1) return { ambiguous: leaders.map((c) => c.item) };
  return { person: ranked[0]!.item };
}

/**
 * A name-like mention that matched nobody: a capitalized word that is not
 * the first word (usually just the sentence start) and not a record key like
 * PAY-1. Reported so the engine says "no such person" instead of silently
 * answering a different question.
 */
function unmatchedPersonMention(question: string): PersonMatch {
  for (const token of question.split(/\s+/).slice(1)) {
    const word = token.replace(/[^A-Za-z'-]/g, '');
    if (/^[A-Z][a-z']{2,}$/.test(word)) return { unmatchedMention: word };
  }
  return {};
}

/* ------------------------------------------------------------------ *
 * Epics and decisions (title-carrying records)
 * ------------------------------------------------------------------ */

/** Words that anchor a question to the epic domain. */
const EPIC_DOMAIN_WORDS = new Set([
  'epic', 'lineage', 'trace', 'behind', 'impact', 'breaks', 'changes',
  'cancel', 'descoped', 'risks', 'risk', 'work',
]);
/** Words that anchor a question to the decision domain. */
const DECISION_DOMAIN_WORDS = new Set([
  'decision', 'decisions', 'adr', 'status', 'trace', 'impact', 'breaks',
  'changes', 'supersede', 'superseded', 'superseding', 'reverse', 'reversed',
  'cancel', 'approved', 'approval',
]);

/**
 * Phrase signals that anchor a question to the decision domain when no
 * single content token does: "what did we decide on retries?" has no
 * decision noun, but the decide-verb carries the domain just as strongly
 * (it only ever introduces decision talk). "move away from" is the same:
 * asking why the team abandoned an approach asks about the recorded
 * decision behind it. Phrase-tested against the raw question, because the
 * signal spans several words the tokenizer would scatter.
 */
const DECISION_DOMAIN_PHRASES: RegExp[] = [
  /\bdecid(?:e|es|ed|ing)\b/i,
  /\bmade\s+the\s+call\b/i,
  /\bmov(?:e|es|ed|ing)\s+away\s+from\b/i,
];

/** Content tokens of a record title, with noise ("Decision:") removed. */
export function titleTokens(title: string): string[] {
  return tokens(title.replace(/^decision:\s*/i, ''));
}

interface RecordScorerInput {
  /** Lowercased question. */
  lower: string;
  /** Question content tokens. */
  qTokens: string[];
  /** Dash-preserving lowercased question words, for id matching. */
  words: Set<string>;
  /** The record id (issue key), lowercased. */
  idLower: string;
  /** Title content tokens of the candidate. */
  titleTokens: string[];
  /** The full title, lowercased, "Decision:" prefix removed. */
  titleLower: string;
  /** Tokens unique to this record among its siblings. */
  distinctive: Set<string>;
  /** Domain words present in the question. */
  hasDomainWord: boolean;
}

/**
 * Shared lane scoring for titled records (epics, decisions):
 *  1.00 the record key appears verbatim (any case: "PAY-1", "pay-1");
 *  0.95 the full title appears in the question;
 *  0.88 every title token appears, typo-tolerant, any order
 *        ("reliability payments", "payments reliablity");
 *  0.75 one distinctive title token ("idempotency", "payments") and the
 *        question carries a domain word ("trace the auth epic"). A
 *        distinctive token WITHOUT a domain word matches nothing: "the
 *        payments service" is not an epic question.
 */
function scoreRecord(input: RecordScorerInput): number {
  const { words, idLower, lower, qTokens, titleTokens, titleLower, distinctive, hasDomainWord } = input;
  if (words.has(idLower)) return 1;
  if (titleLower.length >= 3 && lower.includes(titleLower)) return 0.95;

  const matched = titleTokens.filter((t) => qTokens.some((w) => nameTokenMatches(w, t)));
  if (titleTokens.length > 0 && matched.length === titleTokens.length) return 0.88;
  // A single distinctive title token only carries the question when it is
  // substantial (>= 4 chars): "auth" anchors an epic, but "key" (from
  // "idempotency key scope") must not make every "key decision" question
  // match that record.
  const anchor = matched.find((t) => distinctive.has(t) && t.length >= 4);
  if (hasDomainWord && anchor) return 0.75;
  return 0;
}

/** For each record, the title tokens no sibling record shares. */
function distinctiveTokens(titleTokenLists: string[][]): Set<string>[] {
  const count = new Map<string, number>();
  for (const ts of titleTokenLists) {
    for (const t of new Set(ts)) count.set(t, (count.get(t) ?? 0) + 1);
  }
  return titleTokenLists.map((ts) => {
    const set = new Set<string>();
    for (const t of new Set(ts)) if (count.get(t) === 1) set.add(t);
    return set;
  });
}

export interface EpicMatch {
  epicId?: string;
  ambiguous?: boolean;
}

export interface RecordMatchOptions {
  /**
   * Treat the input as a direct reference rather than a natural-language
   * question: the distinctive-token lane then fires without a domain word.
   * Tool arguments (MCP resolvers) want this; prose questions do not —
   * "the payments service" must not match the Payments epic, but a tool
   * argument "payments" clearly means it.
   */
  assumeDomain?: boolean;
}

export function matchEpic(graph: OrgGraph, question: string, options: RecordMatchOptions = {}): EpicMatch {
  const q = question.trim();
  const lower = normalize(q);
  const qTokens = tokens(q);
  const words = new Set(rawWords(q));
  const hasDomainWord =
    options.assumeDomain === true || qTokens.some((t) => EPIC_DOMAIN_WORDS.has(t));

  const matcherIndex = getMatcherIndex(graph);
  const records = matcherIndex.epicRecords;
  const distinctive = matcherIndex.epicDistinctive;

  const scored: ScoredCandidate<string>[] = [];
  records.forEach((record, i) => {
    const score = scoreRecord({
      lower,
      qTokens,
      words,
      idLower: record.id.toLowerCase(),
      titleTokens: record.titleTokens,
      titleLower: record.titleLower,
      distinctive: distinctive[i]!,
      hasDomainWord,
    });
    if (score > 0) scored.push({ item: record.id, score });
  });

  const ranked = rank(scored, (id) => id);
  if (ranked.length === 0) return {};
  if (tiedLeaders(ranked).length > 1) return { ambiguous: true };
  return { epicId: ranked[0]!.item };
}

export interface DecisionMatch {
  decisionId?: string;
  ambiguous?: boolean;
}

export function matchDecision(graph: OrgGraph, question: string, options: RecordMatchOptions = {}): DecisionMatch {
  const q = question.trim();
  const lower = normalize(q);
  const qTokens = tokens(q);
  const words = new Set(rawWords(q));
  const hasDomainWord =
    options.assumeDomain === true ||
    qTokens.some((t) => DECISION_DOMAIN_WORDS.has(t)) ||
    DECISION_DOMAIN_PHRASES.some((re) => re.test(q));

  const matcherIndex = getMatcherIndex(graph);
  const records = matcherIndex.decisionRecords;
  const distinctive = matcherIndex.decisionDistinctive;

  const scored: ScoredCandidate<string>[] = [];
  records.forEach((record, i) => {
    const score = scoreRecord({
      lower,
      qTokens,
      words,
      idLower: record.id.toLowerCase(),
      titleTokens: record.titleTokens,
      titleLower: record.titleLower,
      distinctive: distinctive[i]!,
      hasDomainWord,
    });
    if (score > 0) scored.push({ item: record.id, score });
  });

  const ranked = rank(scored, (id) => id);
  if (ranked.length === 0) return {};
  if (tiedLeaders(ranked).length > 1) return { ambiguous: true };
  return { decisionId: ranked[0]!.item };
}

/* ------------------------------------------------------------------ *
 * Resolver API for tool surfaces (MCP, check gate, future connectors)
 * ------------------------------------------------------------------ */

export interface ResolveError extends Error {
  code: 'ambiguous' | 'not-found';
  candidates: string[];
}

const resolveError = (code: ResolveError['code'], message: string, candidates: string[]): ResolveError =>
  Object.assign(new Error(message), { code, candidates });

/** Resolve a person reference for a tool argument: id, name, prefix or close typo. */
export function resolvePerson(graph: OrgGraph, query: string): Person {
  const match = matchPerson(graph, query);
  if (match.person) return match.person;
  const known = graph.people.map((p) => `${p.name} (${p.id})`).join(', ') || 'none';
  if (match.ambiguous) {
    throw resolveError(
      'ambiguous',
      `Multiple people match '${query}': ${match.ambiguous.map((p) => p.name).join(', ')}. Use the exact name or id.`,
      match.ambiguous.map((p) => p.name),
    );
  }
  throw resolveError('not-found', `No person matches '${query}'. Known people: ${known}.`, []);
}

/** Resolve an epic reference for a tool argument: key (any case), title, or distinctive token. */
export function resolveEpic(graph: OrgGraph, query: string): WorkItem {
  const index = getIndex(graph);
  const match = matchEpic(graph, query, { assumeDomain: true });
  if (match.epicId) {
    const epic = index.workById.get(match.epicId);
    if (epic) return epic;
  }
  const known = index.epics.map((e) => e.ref.id).join(', ') || 'none';
  if (match.ambiguous) {
    throw resolveError('ambiguous', `Multiple epics match '${query}'. Known epics: ${known}.`, []);
  }
  throw resolveError('not-found', `No epic matches '${query}'. Known epics: ${known}.`, []);
}

/** Resolve a decision reference for a tool argument: id, title, or distinctive token. */
export function resolveDecisionId(graph: OrgGraph, query: string): string {
  const match = matchDecision(graph, query, { assumeDomain: true });
  if (match.decisionId) return match.decisionId;
  const known = graph.decisions.map((d) => d.ref.id).join(', ') || 'none';
  if (match.ambiguous) {
    throw resolveError('ambiguous', `Multiple decisions match '${query}'. Known decisions: ${known}.`, []);
  }
  throw resolveError('not-found', `No decision matches '${query}'. Known decisions: ${known}.`, []);
}
