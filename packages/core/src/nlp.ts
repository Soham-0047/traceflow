/**
 * The compromise-backed analysis layer of the in-house NLU (session 14).
 *
 * TraceFlow's understanding layer was regex-only until now. The session-13
 * regression class showed the ceiling of that approach: the departure lane
 * misread the NOUN "leave" as the departure verb because a regex cannot see
 * part of speech, and the fix was to enumerate every verbal form by hand.
 * This module brings in `compromise` (MIT, ~250 KB, zero runtime
 * dependencies, deterministic tagging, browser and Node) to provide the two
 * things regexes cannot:
 *
 *  1. PART-OF-SPEECH GATES — "leave" as a noun (scheduling question) vs a
 *     verb (departure hypothetical); gerund vs past-tense availability
 *     wording; phrasal verbs ("walks off the job", "gets pulled onto").
 *     The signal regexes in intent.ts stay the source of truth for WHAT a
 *     wording means; the POS tags here tighten WHEN a lazy lane may fire.
 *  2. MULTIWORD IDIOM LEXICON — the domain idioms ("bus number", "knock-on
 *     effect", "take for granted") taught once through `nlp.addWords`, so
 *     the intent layer can ask `has('bus number')` and the tokenizer keeps
 *     the idiom together instead of scattering it.
 *
 * Determinism contract: the engine answers the same question byte-identically
 * over the same graph. compromise's internal term ids are per-instance
 * counters (NOT stable across calls), but the POS tags, .has() and .people()
 * outputs ARE stable — this module only exposes those stable surfaces and
 * caches the analysis per question string, so the answer layer's determinism
 * is preserved by construction (the e2e determinism stage keeps asserting it).
 *
 * Cost contract: nlp() measures ~0.2 ms per question (session-14 benchmark,
 * 3000 calls). Every question is analyzed exactly once and the result cached
 * in an LRU (the eval harness re-asks the same strings; the MCP server gets
 * repeated tool input), keeping the per-question latency budget intact.
 *
 * Honesty contract: nothing here interprets MEANING beyond what intent.ts
 * already encodes — compromise is a POS tagger, not a model, and it runs
 * offline on the question text only. The no-LLM-trust model in
 * docs/ARCHITECTURE.md is unchanged: facts still come only from the graph.
 */
import nlp from 'compromise';

/* ------------------------------------------------------------------ *
 * The domain lexicon, taught once (idempotent: re-teaching is a no-op).
 *
 * Only word senses the question traffic actually uses are taught, and only
 * where compromise's statistical default is wrong for this domain:
 *  - the availability NOUNS ("leave", "sabbatical", "vacation") so the
 *    if-lane can require a noun tag when it meets them outside a be-verb;
 *  - the domain idioms as multiword lexemes so `.has()` keeps them whole;
 *  - the ghosting/transfer verbs whose dictionary default is a noun sense
 *    ("ghosts" the game, "shelved" the state) — the verb sense is what the
 *    if-lane consumes.
 * ------------------------------------------------------------------ */

const DOMAIN_LEXICON: Record<string, string> = {
  // Availability nouns: the scheduling-vs-hypothetical boundary the POS tag
  // now enforces (the session-13 bare-leave bug class, mechanized).
  leave: 'Noun',
  sabbatical: 'Noun',
  vacation: 'Noun',
  // Multiword domain idioms, so `.has('bus number')` matches as one lexeme
  // and the intent layer stops enumerating their verbal variants by hand.
  'bus number': 'Noun',
  'knock-on effect': 'Noun',
  'second-order effect': 'Noun',
  'second-order effects': 'Plural',
  'knock-on effects': 'Plural',
  // Verb senses the dictionary gets wrong for this domain's traffic.
  ghost: 'Verb',
  ghosts: 'Verb',
  shelved: 'Verb',
  travelling: 'Verb',
};

let lexiconTaught = false;

function teachDomainLexicon(): void {
  if (lexiconTaught) return;
  nlp.addWords(DOMAIN_LEXICON);
  lexiconTaught = true;
}

/* ------------------------------------------------------------------ *
 * The stable analysis surface (everything below is deterministic across
 * repeated calls; compromise's unstable internal term ids never escape).
 * ------------------------------------------------------------------ */

export interface QuestionAnalysis {
  /** Words tagged as nouns (lowercased text). */
  nouns: string[];
  /** Words tagged as verbs, with phrasal verbs kept whole ("walks off"). */
  verbs: string[];
  /** Words compromise recognizes as person-like ("Alex", "Sam"). */
  personWords: string[];
  /** Multiword idiom membership, e.g. has('bus number'). */
  has: (idiom: string) => boolean;
  /** POS tag test on a single word: nounTag('leave') when "leave" appears. */
  isNounWord: (word: string) => boolean;
  /** POS tag test on a single word: verbTag('ghosts') when it appears. */
  isVerbWord: (word: string) => boolean;
}

/* ------------------------------------------------------------------ *
 * LRU cache: the eval harness re-asks identical strings and the e2e
 * latency stage budgets a warm cache; compromise work must not be paid
 * twice. Bounded so a long-lived MCP server cannot grow it unbounded.
 * ------------------------------------------------------------------ */

const CACHE_LIMIT = 512;
const cache = new Map<string, QuestionAnalysis>();

/** Tag-set lookup for one word's occurrences in the question (stable order). */
function tagOfWord(doc: ReturnType<typeof nlp>, word: string): 'noun' | 'verb' | null {
  // Walk the term-level JSON directly instead of doc.match(word): match()
  // returns whole noun phrases ("priya leaves?" with the question mark),
  // and a trailing "?" makes compromise re-tag the phrase's last word as a
  // noun even when it is the departure verb ("before priya leaves?" — the
  // session-13 test case). Term-level tags keyed on the normalized text
  // are punctuation-insensitive and stable.
  const sentences = doc.terms().json() as Array<{ terms: Array<{ normal?: string; text: string; tags?: Set<string> | string[] }> }>;
  for (const sentence of sentences) {
    for (const term of sentence.terms) {
      const normal = (term.normal ?? term.text).toLowerCase().replace(/[^a-z]/g, '');
      if (normal !== word.toLowerCase()) continue;
      const tags = Array.from((term.tags ?? new Set<string>()) as Set<string>);
      if (tags.includes('Noun')) return 'noun';
      if (tags.includes('Verb')) return 'verb';
    }
  }
  return null;
}

/**
 * Analyze one question. Deterministic, cached (same string → same object),
 * and self-contained: teach-once lexicon, one nlp() call, stable surfaces
 * only. This is the module the intent layer and the answer layer both sit
 * on; it never interprets, only tags.
 */
export function analyzeQuestion(question: string): QuestionAnalysis {
  const cached = cache.get(question);
  if (cached) return cached;

  teachDomainLexicon();
  const doc = nlp(question);

  const analysis: QuestionAnalysis = {
    nouns: (doc.nouns().out('array') as string[]).map((s) => s.toLowerCase()),
    verbs: (doc.verbs().out('array') as string[]).map((s) => s.toLowerCase().replace(/[?!.]+$/, '')),
    personWords: (doc.people().out('array') as string[]).map((s) => s.toLowerCase().replace(/[?!.]+$/, '')),
    has: (idiom: string) => doc.has(idiom),
    isNounWord: (word: string) => tagOfWord(doc, word) === 'noun',
    isVerbWord: (word: string) => tagOfWord(doc, word) === 'verb',
  };

  if (cache.size >= CACHE_LIMIT) {
    // Map preserves insertion order; evict the oldest entry.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(question, analysis);
  return analysis;
}

/** Test hook: clear the analysis cache (used by the unit tests). */
export function clearAnalysisCache(): void {
  cache.clear();
}
