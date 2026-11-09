/**
 * In-house text algorithms for the deterministic NLU layer. No dependencies,
 * no models: everything here is a pure function of its input, so the same
 * question over the same graph always produces the same match — the property
 * the e2e determinism stage asserts for the whole answer layer.
 *
 * Three primitives power the fuzzy matchers (matcher.ts):
 *  - `tokens`          word splitting with stop-word removal (lowercased);
 *  - `editDistance`    Damerau-Levenshtein distance with an early-exit band,
 *                      so long inputs cannot blow up the latency budget;
 *  - `tokenSimilarity` set-based overlap (Jaccard) between two token lists,
 *                      which survives word reordering ("scope idempotency key").
 */

/** Lowercase, trim, collapse internal whitespace. */
export function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Content words of a text: lowercase, split on non-alphanumerics, stop words
 * removed, single characters dropped. "the" and "of" carry no signal about
 * which person, epic or decision a question names.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'by',
  'with', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that',
  'these', 'those', 'it', 'its', 'as', 'if', 'then', 'than', 'so', 'what',
  'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'do', 'does',
  'did', 'done', 'can', 'could', 'should', 'would', 'will', 'shall', 'may',
  'might', 'must', 'me', 'my', 'our', 'ours', 'your', 'you', 'us', 'we', 'they',
  'them', 'their', 'he', 'she', 'his', 'her', 'him', 'i',
]);

export function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

/** First letters of the content tokens, e.g. "Alex R." -> "ar". */
export function initialsOf(text: string): string {
  return tokens(text)
    .map((t) => t[0]!)
    .join('');
}

/* ------------------------------------------------------------------ *
 * Damerau-Levenshtein distance (optimal string alignment)
 * ------------------------------------------------------------------ */

/**
 * Edit distance allowing insertions, deletions, substitutions and one
 * transposition of adjacent characters ("rivear" -> "rivera" costs 1, which
 * is the dominant real-world typo shape for names typed from memory).
 *
 * `max` bounds the search: as soon as every path in the current row exceeds
 * it, the function returns `max + 1`. Callers use the bound to reject early,
 * keeping the matcher O(len_a * len_b) worst case but near O(len_a) for the
 * common "clearly different" case.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > max) return max + 1;

  // Three rotating buffers: `prev` holds row i-1, `prevPrev` holds row i-2
  // (needed for transpositions) and `curr` is the scratch row being filled.
  // The rotation must cycle all three — reusing the prev buffer as the next
  // scratch would alias `prevPrev` and corrupt the transposition lane.
  let prevPrev = new Int32Array(lenB + 1);
  let prev = new Int32Array(lenB + 1);
  let curr = new Int32Array(lenB + 1);
  for (let j = 0; j <= lenB; j++) prev[j] = j;

  for (let i = 1; i <= lenA; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lenB; j++) {
      const cb = b.charCodeAt(j - 1);
      const substitution = prev[j - 1]! + (ca === cb ? 0 : 1);
      const insertion = prev[j]! + 1;
      const deletion = curr[j - 1]! + 1;
      let best = Math.min(substitution, insertion, deletion);
      if (
        i > 1 && j > 1 && ca === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === cb
      ) {
        best = Math.min(best, prevPrev[j - 2]! + 1);
      }
      curr[j] = best;
      if (best < rowMin) rowMin = best;
    }
    if (rowMin > max) return max + 1;
    const recycle = prevPrev;
    prevPrev = prev;
    prev = curr;
    curr = recycle;
  }
  const result = prev[lenB]!;
  return result > max ? max + 1 : result;
}

/**
 * Length-aware typo budget: how many edits a token may absorb and still count
 * as the same word. Short words tolerate proportionally less noise ("sam" vs
 * "pas" is a different word; "alexandra" vs "alexandr" is a typo).
 */
export function typoBudget(token: string): number {
  if (token.length <= 3) return 0;
  if (token.length <= 7) return 1;
  if (token.length <= 11) return 2;
  return 3;
}

/**
 * Inflectional equality: the same content word in singular and plural form
 * ("retry" / "retries", "risk" / "risks", "box" / "boxes"). Covers the three
 * English plural rules that matter for record titles — bare -s, -es after a
 * sibilant, and consonant+y -> -ies — in both directions.
 *
 * This is NOT a stemmer: derivationally related words ("decide" / "decision",
 * "run" / "runbook") stay different words with different meanings, because
 * folding them together would make any decide-verb question match any
 * "decision" record. Only the inflectional suffix is folded, and only when
 * the remainder is a substantial word (3+ chars for -s/-es, 4+ for y->ies).
 *
 * The typo budget cannot cover this gap: "retry" -> "retries" costs three
 * edits (y->i plus two insertions), far beyond any budget a 5-letter word
 * gets — yet every native speaker reads them as the same word.
 */
export function inflectionalMatch(word: string, candidate: string): boolean {
  if (word === candidate) return true;
  const sOrEs = (base: string, suffixed: string): boolean =>
    base.length >= 3 && (suffixed === `${base}s` || suffixed === `${base}es`);
  if (sOrEs(word, candidate) || sOrEs(candidate, word)) return true;
  const yToIes = (base: string, plural: string): boolean =>
    base.length >= 4 &&
    base.endsWith('y') &&
    !'aeiou'.includes(base[base.length - 2]!) &&
    plural === `${base.slice(0, -1)}ies`;
  return yToIes(word, candidate) || yToIes(candidate, word);
}

/** True when `candidate` is `word` or within its typo budget. */
export function tokenMatches(word: string, candidate: string): boolean {
  if (word === candidate) return true;
  if (Math.abs(word.length - candidate.length) > typoBudget(word)) return false;
  return editDistance(word, candidate, typoBudget(word)) <= typoBudget(word);
}

/* ------------------------------------------------------------------ *
 * Set-based similarity
 * ------------------------------------------------------------------ */

/**
 * Jaccard overlap between the token sets of two texts, in [0, 1]. Reordering
 * ("scope idempotency key" vs "idempotency key scope") scores 1; an unrelated
 * text scores 0. Fuzzy token equality is NOT applied here: set overlap is the
 * strict lane, typo tolerance lives in `tokenMatches`.
 */
export function tokenSimilarity(a: string, b: string): number {
  const setA = new Set(tokens(a));
  const setB = new Set(tokens(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Best single-token match score between a query and a target, in [0, 1]:
 * 1 when some query token equals a target token, decaying with the edit
 * distance actually spent (within the typo budget). Used for the "one
 * distinctive word" lane of the entity matchers ("the idempotency decision").
 */
export function bestTokenScore(queryTokens: string[], targetTokens: string[]): number {
  let best = 0;
  for (const q of queryTokens) {
    for (const t of targetTokens) {
      if (q === t) return 1;
      const budget = Math.min(typoBudget(q), typoBudget(t));
      if (budget === 0 || Math.abs(q.length - t.length) > budget) continue;
      const distance = editDistance(q, t, budget);
      if (distance <= budget) {
        const score = 1 - distance / (budget + 1);
        if (score > best) best = score;
      }
    }
  }
  return best;
}
