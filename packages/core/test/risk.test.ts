import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, assessPersonRisk, levelFor, rankPeopleByRisk, sampleGraph } from '../src/index.js';

describe('assessPersonRisk', () => {
  const report = assessPersonRisk(sampleGraph, 'alex');
  const byKind = (k: string) => report.findings.find((f) => f.kind === k);

  it('finds sole-contributor pages and ignores shared ones', () => {
    const f = byKind('sole-contributor-page');
    expect(f?.evidence.map((e) => e.id)).toEqual(['p1', 'p2', 'p5', 'p6', 'p7', 'p8', 'p9']);
    expect(f?.confidence).toBe('medium');
  });

  it('counts only open work assigned to the person', () => {
    expect(byKind('open-work')?.evidence.map((e) => e.id)).toEqual(['PAY-12', 'PAY-15', 'PAY-18', 'PAY-21']);
  });

  it('counts only open pull requests', () => {
    expect(byKind('open-pull-request')?.evidence.map((e) => e.id)).toEqual(['pr-31', 'pr-33']);
  });

  it('ignores superseded decisions', () => {
    expect(byKind('pending-decision')?.evidence.map((e) => e.id)).toEqual(['d1', 'd3']);
  });

  it('adds up weighted points and exposes caveats', () => {
    const w = DEFAULT_WEIGHTS;
    const expected = 7 * w.solePage + 4 * w.openWork + 2 * w.openPullRequest + 2 * w.pendingDecision;
    expect(report.score).toBe(expected);
    expect(report.findings.reduce((s, f) => s + f.points, 0)).toBe(expected);
    expect(report.caveats.length).toBeGreaterThan(0);
  });

  it('rates the departing engineer in the sample data as high risk', () => {
    expect(report.score).toBe(63);
    expect(report.level).toBe('high');
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

describe('rankPeopleByRisk', () => {
  it('orders people by descending score with the departing engineer first', () => {
    const ranked = rankPeopleByRisk(sampleGraph);
    expect(ranked[0]?.personId).toBe('alex');
    const scores = ranked.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(ranked).toHaveLength(sampleGraph.people.length);
  });
});
