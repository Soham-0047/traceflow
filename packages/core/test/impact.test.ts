import { describe, expect, it } from 'vitest';
import { IMPACT_RULES, personImpact, sampleGraph } from '../src/index.js';
import type { OrgGraph } from '../src/index.js';

describe('personImpact', () => {
  it('maps the blast radius of the highest-risk person (Alex)', () => {
    const report = personImpact(sampleGraph, 'alex');

    // One stalled epic: PAY-1 holds every open item Alex owns.
    const stalled = report.areas.filter((a) => a.kind === 'stalled-epic');
    expect(stalled).toHaveLength(1);
    expect(stalled[0]?.title).toContain('Payments reliability');
    expect(stalled[0]?.evidence.map((e) => e.id)).toEqual(['PAY-1', 'PAY-12', 'PAY-15', 'PAY-18', 'PAY-21']);

    // Sole-contributor pages become orphaned knowledge.
    expect(report.counts.orphanedPages).toBe(7);

    // d1 waits on Alex as approver; d3 is owned by Alex; d2 is superseded and excluded.
    const blocked = report.areas.filter((a) => a.kind === 'blocked-decision');
    expect(blocked.map((a) => a.evidence[0]?.id).sort()).toEqual(['d1', 'd3']);
    expect(blocked.find((a) => a.evidence[0]?.id === 'd1')?.detail).toContain('outstanding approver');
    expect(blocked.find((a) => a.evidence[0]?.id === 'd3')?.detail).toContain('owns this decision');

    // Open pull requests lose their author.
    expect(report.counts.unmergedChanges).toBe(2);
    expect(report.counts.stalledWork).toBe(0);
    expect(report.counts.stalledEpics).toBe(1);
  });

  it('groups un-epicked open work as stalled work, not stalled epics', () => {
    const graph: OrgGraph = {
      ...sampleGraph,
      workItems: [
        ...sampleGraph.workItems,
        {
          ref: { source: 'jira', id: 'OPS-2', title: 'Rotate service credentials' },
          type: 'task',
          assigneeId: 'sam',
          status: 'open',
        },
      ],
    };
    const report = personImpact(graph, 'sam');
    expect(report.counts.stalledWork).toBe(1);
    const work = report.areas.find((a) => a.kind === 'stalled-work');
    expect(work?.title).toContain('Rotate service credentials');
    // AUTH-1 stalls through Sam's open item; PAY-1 stalls because Sam owns the epic record.
    expect(report.counts.stalledEpics).toBe(2);
    const pay = report.areas.find((a) => a.kind === 'stalled-epic' && a.evidence[0]?.id === 'PAY-1');
    expect(pay?.detail).toContain('owns this epic record');
    const auth = report.areas.find((a) => a.kind === 'stalled-epic' && a.evidence[0]?.id === 'AUTH-1');
    expect(auth?.evidence.map((e) => e.id)).toEqual(['AUTH-1', 'AUTH-4']);
    expect(auth?.detail).toContain('owns the epic record itself');
  });

  it('reports an empty blast radius with the caveats kept', () => {
    const report = personImpact(sampleGraph, 'priya');
    // Priya has one page and one epic item, so build a truly empty person instead.
    const graph: OrgGraph = {
      ...sampleGraph,
      people: [...sampleGraph.people, { id: 'jordan', name: 'Jordan Blake' }],
    };
    const empty = personImpact(graph, 'jordan');
    expect(empty.areas).toEqual([]);
    expect(empty.counts).toEqual({
      stalledEpics: 0,
      stalledWork: 0,
      orphanedPages: 0,
      blockedDecisions: 0,
      unmergedChanges: 0,
    });
    expect(empty.caveats.length).toBeGreaterThan(0);
    expect(report.counts.orphanedPages).toBe(1);
    expect(report.counts.stalledEpics).toBe(1);
  });

  it('is deterministic and every area carries evidence', () => {
    for (const person of sampleGraph.people) {
      const a = personImpact(sampleGraph, person.id);
      const b = personImpact(sampleGraph, person.id);
      expect(a).toEqual(b);
      for (const area of a.areas) {
        expect(area.evidence.length).toBeGreaterThan(0);
        expect(IMPACT_RULES[area.kind].length).toBeGreaterThan(0);
      }
    }
  });

  it('throws for an unknown person', () => {
    expect(() => personImpact(sampleGraph, 'nobody')).toThrow(/Unknown person/);
  });
});
