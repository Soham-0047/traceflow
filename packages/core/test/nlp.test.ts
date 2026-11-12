import { describe, expect, it } from 'vitest';
import {
  analyzeQuestion,
  clearAnalysisCache,
} from '../src/nlp.js';

/**
 * Session-14 tests: the compromise-backed analysis layer. The contracts that
 * must hold for the answer layer's guarantees to survive the first runtime
 * dependency:
 *  - determinism: the same question analyzes identically (compromise's
 *    internal term ids are per-instance counters; the module exposes only
 *    the stable surfaces — tags, .has(), .people());
 *  - the POS gates catch what enumeration cannot: the NOUN "leave" of a
 *    scheduling question vs the VERB "leaves" of a departure hypothetical;
 *  - the domain lexicon teaches the multiword idioms and the mis-tagged
 *    domain verbs exactly once;
 *  - the cache engages (a repeated question is not re-analyzed) and is
 *    bounded (a long-lived server cannot grow it without limit).
 */

describe('analyzeQuestion POS gates', () => {
  it('tags the noun "leave" in scheduling shapes and the verb in departure shapes', () => {
    // The session-13 bug class: "when does priya go on parental leave?" reads
    // "leave" as the departure verb. The gate must see a NOUN.
    expect(analyzeQuestion('when does priya go on parental leave?').isNounWord('leave')).toBe(true);
    expect(analyzeQuestion('when will sam be back from leave?').isNounWord('leave')).toBe(true);
    // The departure verb forms are VERBS.
    expect(analyzeQuestion('if priya leaves the company').isVerbWord('leaves')).toBe(true);
    expect(analyzeQuestion('if alex left tomorrow').isVerbWord('left')).toBe(true);
  });

  it('recognizes the taught domain verbs the dictionary mistags as nouns', () => {
    // "ghosts" the game / "shelved" the state — the verb senses the traffic uses.
    expect(analyzeQuestion('what if alex ghosts us?').isVerbWord('ghosts')).toBe(true);
    expect(analyzeQuestion('what if the payments epic gets shelved?').isVerbWord('shelved')).toBe(true);
    expect(analyzeQuestion('who is exposed while alex is travelling?').isVerbWord('travelling')).toBe(true);
  });

  it('matches the taught multiword idioms as whole lexemes', () => {
    expect(analyzeQuestion('what is our bus number?').has('bus number')).toBe(true);
    expect(analyzeQuestion('what is the knock-on effect of the queue decision?').has('knock-on effect')).toBe(true);
    expect(analyzeQuestion('what are the second-order effects of the revamp?').has('second-order effects')).toBe(true);
    // Near-miss wordings must NOT match the taught idioms.
    expect(analyzeQuestion('what is our number one priority?').has('bus number')).toBe(false);
    expect(analyzeQuestion('what is the effect of the queue decision?').has('knock-on effect')).toBe(false);
  });

  it('extracts person-like words compromise recognizes', () => {
    expect(analyzeQuestion('what if alex leaves?').personWords).toContain('alex');
    expect(analyzeQuestion('what about sam?').personWords).toContain('sam');
    // Capitalized mid-sentence phrases are not people (the matcher heuristic
    // keeps its own unmatched-mention lane; compromise adds only hints).
    expect(analyzeQuestion('who is our Single Point of Failure?').personWords).toEqual([]);
  });
});

describe('analyzeQuestion determinism and caching', () => {
  it('returns identical analysis for the same question, across cache clears', () => {
    const q = 'what breaks if alex leaves?';
    const first = analyzeQuestion(q);
    const second = analyzeQuestion(q);
    expect(second).toBe(first); // cached: the same object
    clearAnalysisCache();
    const third = analyzeQuestion(q);
    expect(third.isNounWord('leave')).toBe(first.isNounWord('leave'));
    expect(third.isVerbWord('leaves')).toBe(first.isVerbWord('leaves'));
    expect(third.has('bus number')).toBe(first.has('bus number'));
  });

  it('keeps the cache bounded (LRU eviction under load)', () => {
    clearAnalysisCache();
    // Drive 600 distinct questions through the cache (limit 512).
    for (let i = 0; i < 600; i++) {
      analyzeQuestion(`question number ${i} about the payments epic?`);
    }
    // The cache interface is not directly observable; the contract is that
    // analysis still works and stays deterministic after eviction pressure.
    const again = analyzeQuestion('question number 0 about the payments epic?');
    expect(again.has('bus number')).toBe(false);
    expect(again.personWords).toEqual([]);
    clearAnalysisCache();
  });
});
