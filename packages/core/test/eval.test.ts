import { describe, expect, it } from 'vitest';
import {
  EVAL_CORPUS,
  EVAL_CORPUS_ALL,
  EVAL_CORPUS_HARD,
  evaluateAnswerLayer,
  formatEvalSummary,
} from '../src/eval.js';
import { answerQuery } from '../src/query.js';
import { sampleGraph } from '../src/fixtures.js';

/**
 * The efficiency gate. The measured number must stay inside the tuned band:
 *  - at or above 88%: the floor. A regression below it means the answer
 *    layer lost understanding (a matcher or intent change broke real
 *    phrasings) and CI must fail;
 *  - the target band is 88-95%: the corpus deliberately contains documented
 *    synonym-gap cases the engine does not map yet, so the number is honest
 *    headroom, not a vanity metric.
 */
const FLOOR = 0.88;

describe('answer-layer efficiency (measured, gated)', () => {
  const report = evaluateAnswerLayer();

  it('corpus is substantial and mixed', () => {
    expect(EVAL_CORPUS.length).toBeGreaterThanOrEqual(100);
    expect(EVAL_CORPUS_HARD.length).toBeGreaterThanOrEqual(30);
    expect(EVAL_CORPUS_ALL.length).toBe(EVAL_CORPUS.length + EVAL_CORPUS_HARD.length);
    // Every intent is covered, and there are honest-miss cases.
    const intents = new Set(EVAL_CORPUS.map((c) => c.expect.intent).filter(Boolean));
    expect(intents.size).toBe(8);
    expect(EVAL_CORPUS_ALL.filter((c) => !c.expect.understood).length).toBeGreaterThanOrEqual(20);
  });

  it('efficiency is at or above the 88% floor (target band 88-95%)', () => {
    // Print the measured number: the headline metric of this layer.
    console.log(formatEvalSummary(report));
    for (const failure of report.failures) {
      console.log(`  gap: "${failure.question}" -> ${JSON.stringify(failure.actual)}`);
    }
    expect(report.efficiency).toBeGreaterThanOrEqual(FLOOR);
  });

  it('every understood answer carries evidence and caveats (end-to-end contract)', () => {
    for (const evalCase of EVAL_CORPUS_ALL) {
      const result = answerQuery(sampleGraph, evalCase.question);
      if (!result.understood) continue;
      expect(result.evidence.length, evalCase.question).toBeGreaterThan(0);
      expect(result.caveats.length, evalCase.question).toBeGreaterThan(0);
    }
  });

  it('honest misses never carry evidence and always suggest what to ask', () => {
    for (const evalCase of EVAL_CORPUS_ALL.filter((c) => !c.expect.understood)) {
      const result = answerQuery(sampleGraph, evalCase.question);
      if (result.understood) continue; // a documented gap; counted by efficiency
      expect(result.evidence, evalCase.question).toEqual([]);
      expect(result.suggestions, evalCase.question).toBeDefined();
    }
  });

  it('the report is deterministic: two runs agree exactly', () => {
    const again = evaluateAnswerLayer();
    expect(again).toEqual(report);
  });

  it('no duplicate questions in the corpus', () => {
    const seen = new Set<string>();
    for (const evalCase of EVAL_CORPUS_ALL) {
      expect(seen.has(evalCase.question), evalCase.question).toBe(false);
      seen.add(evalCase.question);
    }
  });
});
