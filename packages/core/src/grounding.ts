import type { AnswerResult } from './query.js';

/**
 * The grounding guard: when an LLM rephrases a deterministic answer, its text
 * is checked against the facts the engine actually produced. This is the
 * enforcement half of "AI may explain, never originate" (AGENTS.md):
 *
 *  - person names and record ids mentioned in the text must exist in the
 *    answer's data or evidence;
 *  - numbers mentioned in the text must appear in the data (scores, counts,
 *    record ids' numeric parts);
 *  - anything the guard cannot verify is reported as a violation, and
 *    `groundedAnswer` falls back to the deterministic answer text.
 *
 * Honest limits, stated up front: this is a lexical guard, not semantics. It
 * catches invented people, invented record keys and invented numbers — the
 * common hallucination shapes — but it cannot judge whether a fully grounded
 * sentence is a faithful summary. That is why the deterministic answer is
 * always the fallback, and why the answer layer itself never calls a model.
 */

export interface GroundingFacts {
  /** Lowercased person names and ids that may be mentioned. */
  people: Set<string>;
  /** Lowercased record ids and titles that may be mentioned. */
  records: Set<string>;
  /** Every number (as string) that appears in the answer data and evidence titles. */
  numbers: Set<string>;
}

export interface GroundingViolation {
  kind: 'person' | 'record' | 'number';
  value: string;
  reason: string;
}

export interface GroundingReport {
  grounded: boolean;
  violations: GroundingViolation[];
  checked: { people: number; records: number; numbers: number };
}

function collectNumbers(value: unknown, into: Set<string>): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    into.add(String(value));
  } else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, into);
  } else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) collectNumbers(item, into);
  }
}

/** Extract the set of facts an LLM rephrasing of `answer` is allowed to state. */
export function groundingFacts(answer: AnswerResult): GroundingFacts {
  const people = new Set<string>();
  const records = new Set<string>();
  const numbers = new Set<string>();

  // People: names and ids found anywhere in the data (reports carry personName
  // and person ids) plus the deterministic answer text itself.
  collectStrings(answer.data, (s) => {
    people.add(s.toLowerCase());
  }, { keys: ['personName', 'personId', 'name', 'ownerId', 'authorId', 'assigneeId', 'contributorIds', 'pendingApproverIds', 'reviewerIds'] });

  // Records: evidence refs (source, id, title).
  for (const ref of answer.evidence) {
    records.add(ref.id.toLowerCase());
    if (ref.title) records.add(ref.title.toLowerCase());
  }
  // Also allow ids and titles present in the data payload (e.g. linked work,
  // areas, nodes), so a rephrasing may name any record the report names.
  collectStrings(answer.data, (s) => {
    records.add(s.toLowerCase());
  }, { keys: ['id', 'title', 'epic', 'decision'] });

  // Numbers: every finite number in the data (scores, counts, points) plus the
  // digits inside record ids (so "PAY-12" style mentions do not trip the check)
  // and the numbers the deterministic answer itself states (finding titles
  // carry counts like "7 page(s)").
  collectNumbers(answer.data, numbers);
  for (const ref of answer.evidence) {
    for (const m of ref.id.matchAll(/\d+/g)) numbers.add(m[0]);
  }
  for (const m of answer.answer.matchAll(/\d+/g)) numbers.add(m[0]);

  // The deterministic answer is itself ground truth: its words are allowed.
  for (const word of answer.answer.split(/[^A-Za-z0-9'-]+/)) {
    if (word) {
      const w = word.toLowerCase();
      people.add(w);
      records.add(w);
    }
  }

  return { people, records, numbers };
}

function collectStrings(
  value: unknown,
  add: (s: string) => void,
  opts: { keys: string[] },
): void {
  if (typeof value === 'string') {
    add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') add(item);
      else collectStrings(item, add, opts);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (opts.keys.includes(key)) collectStrings(item, add, opts);
    }
  }
}

/** Token shape: issue keys (PAY-12), pr ids (pr-31), plain words, numbers. */
const TOKEN_RE = /[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*|\d+/g;

/**
 * Check a (possibly LLM-written) text against the facts of an answer.
 * Violations name the unsupported person, record or number.
 */
export function checkGrounding(text: string, facts: GroundingFacts): GroundingReport {
  const violations: GroundingViolation[] = [];
  const rawTokens = text.match(TOKEN_RE) ?? [];
  const tokens = rawTokens.map((t) => t.toLowerCase());

  const allowedWords = new Set<string>();
  for (const set of [facts.people, facts.records]) {
    for (const entry of set) {
      for (const w of entry.split(/[^a-z0-9'-]+/)) if (w.length >= 3) allowedWords.add(w);
    }
  }

  for (let i = 0; i < rawTokens.length; i++) {
    const raw = rawTokens[i]!;
    const token = tokens[i]!;

    // Issue-key-like tokens (contain a dash or are uppercase-with-digits) must
    // be known records. Example: "PAY-99", "pr-42".
    const looksLikeRecordId = /-/.test(raw) && /[a-z]/i.test(raw) && /\d/.test(raw);
    if (looksLikeRecordId) {
      if (!facts.records.has(token)) {
        violations.push({
          kind: 'record',
          value: raw,
          reason: `'${raw}' is not a record in the answer's evidence or data`,
        });
      }
      continue;
    }

    // Pure numbers must appear in the data.
    if (/^\d+$/.test(token)) {
      if (!facts.numbers.has(token)) {
        violations.push({
          kind: 'number',
          value: raw,
          reason: `the number ${raw} does not appear in the answer's data`,
        });
      }
      continue;
    }

    // Capitalized words that are not known first/last names or allowed words
    // are suspicious as invented people. Single capitalized words are only
    // flagged when they look like given names AND do not match anything known
    // AND are not common sentence words.
    if (/^[A-Z][a-z']+$/.test(raw) && token.length >= 3 && !allowedWords.has(token)) {
      if (!COMMON_WORDS.has(token)) {
        violations.push({
          kind: 'person',
          value: raw,
          reason: `'${raw}' is not a person, record or term in the answer's data`,
        });
      }
    }
  }

  return {
    grounded: violations.length === 0,
    violations,
    checked: { people: facts.people.size, records: facts.records.size, numbers: facts.numbers.size },
  };
}

/** Small stop-word set so sentence starts and normal prose do not trip the name check. */
const COMMON_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'there', 'their', 'they', 'have', 'has',
  'are', 'was', 'were', 'will', 'would', 'should', 'could', 'from', 'into', 'onto',
  'every', 'each', 'only', 'also', 'more', 'most', 'than', 'then', 'when', 'what',
  'who', 'why', 'how', 'all', 'any', 'not', 'but', 'you', 'your', 'our', 'out', 'get',
  'its', 'his', 'her', 'him', 'she', 'one', 'two', 'new', 'now', 'may', 'can', 'did',
  'does', 'done', 'been', 'being', 'over', 'under', 'after', 'before', 'while', 'if',
  'in', 'on', 'at', 'to', 'of', 'by', 'as', 'is', 'it', 'an', 'be', 'or', 'no', 'so',
  'we', 'he', 'do', 'up', 'me', 'my', 'us',
]);

export interface GroundedAnswer {
  /** The text to show: the LLM phrasing when grounded, else the deterministic answer. */
  text: string;
  grounded: boolean;
  violations: GroundingViolation[];
  /** True when the deterministic answer was used because the phrasing failed the check. */
  fallbackUsed: boolean;
}

/**
 * The complete guard for an AI surface: verify an LLM's rephrasing of a
 * deterministic answer and never serve it unsupported. On any violation the
 * caller gets the deterministic answer instead — the engine's own words, which
 * are correct by construction.
 */
export function groundedAnswer(llmText: string, answer: AnswerResult): GroundedAnswer {
  if (typeof llmText !== 'string' || llmText.trim().length === 0) {
    return { text: answer.answer, grounded: false, violations: [], fallbackUsed: true };
  }
  const facts = groundingFacts(answer);
  const report = checkGrounding(llmText, facts);
  if (report.grounded) {
    return { text: llmText, grounded: true, violations: [], fallbackUsed: false };
  }
  return { text: answer.answer, grounded: false, violations: report.violations, fallbackUsed: true };
}
