import { describe, expect, it } from 'vitest';
import { buildOverview } from '../src/overview.js';
import { sampleGraph } from '../src/fixtures.js';
import type { OrgGraph } from '../src/types.js';

const emptyGraph: OrgGraph = { people: [], workItems: [], pages: [], pullRequests: [], decisions: [] };

describe('buildOverview', () => {
  it('counts records from the sample graph', () => {
    const report = buildOverview(sampleGraph);
    expect(report.counts).toEqual({
      people: 3,
      epics: 3,
      openWorkItems: 9,
      soleContributorPages: 8,
      pendingDecisions: 2,
      openPullRequests: 2,
    });
  });

  it('ranks the highest-risk people first, capped at three', () => {
    const report = buildOverview(sampleGraph);
    expect(report.topPeople.map((p) => p.personId)).toEqual(['alex', 'priya', 'sam']);
    expect(report.topPeople[0]!.score).toBe(63);
  });

  it('ranks epics by gaps and breaks ties deterministically', () => {
    const report = buildOverview(sampleGraph);
    expect(report.epics.map((e) => e.epic.id)).toEqual(['PAY-1', 'AUTH-1', 'ONB-1']);
    const pay = report.epics[0]!;
    expect(pay.gaps).toBe(2);
    expect(pay.openWork).toBe(4);
  });

  it('reports what the connected data covers', () => {
    expect(buildOverview(sampleGraph).coverage).toEqual({ confluence: true, code: true });
    const noCode: OrgGraph = { ...sampleGraph, pullRequests: [] };
    expect(buildOverview(noCode).coverage).toEqual({ confluence: true, code: false });
  });

  it('is stable for an empty graph and still explains its limits', () => {
    const report = buildOverview(emptyGraph);
    expect(report.counts.people).toBe(0);
    expect(report.topPeople).toEqual([]);
    expect(report.epics).toEqual([]);
    expect(report.caveats.length).toBeGreaterThan(0);
  });

  it('is deterministic: the same graph yields the same report', () => {
    expect(buildOverview(sampleGraph)).toEqual(buildOverview(sampleGraph));
  });
});
