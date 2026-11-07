import { describe, expect, it } from 'vitest';
import { answerQuery, checkGrounding, groundedAnswer, groundingFacts } from '../src/index.js';
import { sampleGraph } from '../src/fixtures.js';

const riskAnswer = answerQuery(sampleGraph, 'What is the risk around Alex Rivera?');
const impactAnswer = answerQuery(sampleGraph, 'What breaks if Alex leaves?');

describe('checkGrounding', () => {
  it('accepts a faithful rephrasing of the deterministic answer', () => {
    const paraphrase =
      'Alex Rivera carries the highest knowledge-continuity risk in this data. The records show 7 sole-contributor pages, 4 unresolved issues, 2 open pull requests and 2 decisions waiting on input, for a score of 63 (high).';
    const report = checkGrounding(paraphrase, groundingFacts(riskAnswer));
    expect(report.violations).toEqual([]);
    expect(report.grounded).toBe(true);
  });

  it('rejects an invented person', () => {
    const hallucination =
      'Alex Rivera is at risk, and Jordan Fields is actually the biggest risk on the team.';
    const report = checkGrounding(hallucination, groundingFacts(riskAnswer));
    expect(report.grounded).toBe(false);
    expect(report.violations.some((v) => v.kind === 'person' && v.value === 'Jordan')).toBe(true);
  });

  it('rejects an invented record key', () => {
    const hallucination = 'Alex Rivera has open work including PAY-99 and an unmerged change pr-777.';
    const report = checkGrounding(hallucination, groundingFacts(riskAnswer));
    expect(report.grounded).toBe(false);
    expect(report.violations.some((v) => v.kind === 'record' && v.value === 'PAY-99')).toBe(true);
    expect(report.violations.some((v) => v.kind === 'record' && v.value === 'pr-777')).toBe(true);
  });

  it('rejects an invented number', () => {
    const hallucination = 'Alex Rivera has a knowledge-risk score of 94.';
    const report = checkGrounding(hallucination, groundingFacts(riskAnswer));
    expect(report.grounded).toBe(false);
    expect(report.violations.some((v) => v.kind === 'number' && v.value === '94')).toBe(true);
  });

  it('does not trip on ordinary sentence words', () => {
    const prose =
      'The records tie a meaningful amount of work and knowledge to Alex Rivera alone; consider a handover before the departure date.';
    const report = checkGrounding(prose, groundingFacts(impactAnswer));
    expect(report.violations.filter((v) => v.kind === 'person')).toEqual([]);
  });
});

describe('groundedAnswer', () => {
  it('serves a grounded LLM phrasing as-is', () => {
    const paraphrase = 'If Alex Rivera becomes unavailable, several pages lose their only recorded contributor.';
    const result = groundedAnswer(paraphrase, impactAnswer);
    expect(result.grounded).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(result.text).toBe(paraphrase);
  });

  it('falls back to the deterministic answer on any violation', () => {
    const hallucination = 'If Alex Rivera leaves, 400 pages will be orphaned and Morgan Freeman owns everything.';
    const result = groundedAnswer(hallucination, impactAnswer);
    expect(result.grounded).toBe(false);
    expect(result.fallbackUsed).toBe(true);
    expect(result.text).toBe(impactAnswer.answer);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('falls back on empty or non-string model output', () => {
    const result = groundedAnswer('   ', impactAnswer);
    expect(result.fallbackUsed).toBe(true);
    expect(result.text).toBe(impactAnswer.answer);
  });
});
