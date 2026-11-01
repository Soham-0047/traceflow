import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, assessPersonRisk, levelFor, sampleGraph } from '../src/index.js';

describe('assessPersonRisk', () => {
  const report = assessPersonRisk(sampleGraph, 'alex');
  const byKind = (k: string) => report.findings.find((f) => f.kind === k);

  it('finds sole-contributor pages and ignores shared ones', () => {
    const f = byKind('sole-contributor-page');
    expect(f?.evidence.map((e) => e.id)).toEqual(['p1', 'p2']);
    expect(f?.confidence).toBe('medium');
  });

  it('counts only open work assigned to the person', () => {
    expect(byKind('open-work')?.evidence.map((e) => e.id)).toEqual(['PAY-12', 'PAY-15']);
  });

  it('counts only open pull requests', () => {
    expect(byKind('open-pull-request')?.evidence.map((e) => e.id)).toEqual(['pr-31']);
  });

  it('ignores superseded decisions', () => {
    expect(byKind('pending-decision')?.evidence.map((e) => e.id)).toEqual(['d1']);
  });

  it('adds up weighted points and exposes caveats', () => {
    const w = DEFAULT_WEIGHTS;
    const expected = 2 * w.solePage + 2 * w.openWork + 1 * w.openPullRequest + 1 * w.pendingDecision;
    expect(report.score).toBe(expected);
    expect(report.findings.reduce((s, f) => s + f.points, 0)).toBe(expected);
    expect(report.caveats.length).toBeGreaterThan(0);
  });

  it('every finding carries evidence', () => {
    for (const f of report.findings) expect(f.evidence.length).toBeGreaterThan(0);
  });

  it('returns a clean report for someone with nothing at risk', () => {
    const r = assessPersonRisk(sampleGraph, 'sam');
    expect(r.findings.find((f) => f.kind === 'sole-contributor-page')).toBeUndefined();
    expect(r.level).toBe('low');
  });

  it('throws for an unknown person', () => {
    expect(() => assessPersonRisk(sampleGraph, 'nobody')).toThrow('Unknown person');
  });

  it('maps scores to levels', () => {
    expect(levelFor(0)).toBe('low');
    expect(levelFor(25)).toBe('medium');
    expect(levelFor(60)).toBe('high');
  });
});
