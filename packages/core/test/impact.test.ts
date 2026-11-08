import { describe, expect, it } from 'vitest';
import { IMPACT_RULES, personImpact, epicImpact, decisionImpact, sampleGraph } from '../src/index.js';
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

describe('epicImpact', () => {
  it('maps the blast radius of the Payments epic (PAY-1)', () => {
    const report = epicImpact(sampleGraph, 'PAY-1');

    // Four open child issues lose their recorded plan, in canonical order.
    expect(report.counts.orphanedWork).toBe(4);
    const orphaned = report.areas.filter((a) => a.kind === 'orphaned-work');
    expect(orphaned.map((a) => a.evidence[1]?.id)).toEqual(['PAY-12', 'PAY-15', 'PAY-18', 'PAY-21']);
    expect(orphaned[0]?.detail).toContain('Payments reliability');

    // Stale specs: pages and decisions linked to the epic or its children.
    expect(report.counts.staleSpecs).toBe(5);
    const stale = report.areas.filter((a) => a.kind === 'stale-spec');
    expect(stale.map((a) => a.evidence[1]?.id)).toEqual(['d1', 'd3', 'p1', 'p5', 'p6']);
    // Decision status is carried into the detail text.
    expect(stale.find((a) => a.evidence[1]?.id === 'd3')?.detail).toContain('still recorded as proposed');

    // Unreviewed changes: open pull requests linked from open work only.
    expect(report.counts.unreviewedChanges).toBe(2);
    const changes = report.areas.filter((a) => a.kind === 'unreviewed-change');
    expect(changes.map((a) => a.evidence[2]?.id).sort()).toEqual(['pr-31', 'pr-33']);
    // pr-28 belongs to done work (PAY-9) and is excluded from the blast radius.
    expect(changes.some((a) => a.evidence[2]?.id === 'pr-28')).toBe(false);

    // Who needs to know: Sam owns the epic record; Alex holds all open work;
    // both own or approve linked decisions.
    expect(report.people.map((p) => p.person.id)).toEqual(['alex', 'sam']);
    expect(report.people[0]?.roles).toEqual([
      'holds open work in this epic',
      'is still approving a decision linked to this epic',
      'owns a decision linked to this epic',
    ]);
    expect(report.people[1]?.roles).toEqual([
      'owns a decision linked to this epic',
      'owns the epic record',
    ]);

    // Pre-existing lineage gaps ride along so answers can mention them.
    expect(report.gaps.length).toBe(2);
    expect(report.gaps.some((g) => g.kind === 'unapproved-decision')).toBe(true);
  });

  it('reports an epic whose only linked decision is superseded (AUTH-1)', () => {
    const report = epicImpact(sampleGraph, 'AUTH-1');
    expect(report.counts).toEqual({ orphanedWork: 1, staleSpecs: 2, unreviewedChanges: 0 });
    const stale = report.areas.filter((a) => a.kind === 'stale-spec');
    expect(stale.map((a) => a.evidence[1]?.id)).toEqual(['d2', 'p2']);
    expect(stale.find((a) => a.evidence[1]?.id === 'd2')?.detail).toContain('superseded');
    // The superseded decision in use appears as a lineage gap too.
    expect(report.gaps.some((g) => g.kind === 'superseded-decision-in-use')).toBe(true);
    expect(report.people.map((p) => p.person.id)).toEqual(['alex', 'sam']);
  });

  it('reports an epic with no linked spec at all (ONB-1) and keeps the caveats', () => {
    const report = epicImpact(sampleGraph, 'ONB-1');
    expect(report.counts).toEqual({ orphanedWork: 1, staleSpecs: 0, unreviewedChanges: 0 });
    expect(report.gaps.some((g) => g.kind === 'no-recorded-spec')).toBe(true);
    expect(report.people.map((p) => p.person.id)).toEqual(['priya']);
    expect(report.people[0]?.roles).toEqual(['holds open work in this epic', 'owns the epic record']);
    expect(report.caveats.length).toBeGreaterThan(0);
  });

  it('is deterministic and every area carries evidence and a rule text', () => {
    for (const epicId of ['PAY-1', 'AUTH-1', 'ONB-1']) {
      const a = epicImpact(sampleGraph, epicId);
      const b = epicImpact(sampleGraph, epicId);
      expect(a).toEqual(b);
      for (const area of a.areas) {
        expect(area.evidence.length).toBeGreaterThan(0);
        expect(IMPACT_RULES[area.kind].length).toBeGreaterThan(0);
      }
    }
  });

  it('throws for an unknown or non-epic id', () => {
    expect(() => epicImpact(sampleGraph, 'NOPE-1')).toThrow(/Unknown epic/);
    expect(() => epicImpact(sampleGraph, 'PAY-12')).toThrow(/Unknown epic/);
  });
});

describe('decisionImpact', () => {
  it('maps the blast radius of the idempotency key scope decision (d3)', () => {
    const report = decisionImpact(sampleGraph, 'd3');
    expect(report.status).toBe('proposed');
    expect(report.counts).toEqual({ outdatedWork: 1, outdatedChanges: 1 });

    const work = report.areas.find((a) => a.kind === 'outdated-work');
    expect(work?.evidence.map((e) => e.id)).toEqual(['d3', 'PAY-15']);
    expect(work?.detail).toContain('idempotency key scope');

    const change = report.areas.find((a) => a.kind === 'outdated-change');
    expect(change?.evidence.map((e) => e.id)).toEqual(['d3', 'PAY-15', 'pr-31']);

    // Alex owns it, is its outstanding approver, holds the open work and
    // authored the open change: four roles from one person, all record-backed.
    expect(report.people.map((p) => p.person.id)).toEqual(['alex']);
    expect(report.people[0]?.roles).toEqual([
      'authored an open change linked to this decision',
      'holds open work linked to this decision',
      'is still approving this decision',
      'owns this decision',
    ]);
  });

  it('maps a superseded decision with open work attached (d2) and one whose linked work is mixed-status (d1)', () => {
    const d2 = decisionImpact(sampleGraph, 'd2');
    expect(d2.status).toBe('superseded');
    expect(d2.counts).toEqual({ outdatedWork: 1, outdatedChanges: 0 });
    // Sam holds the open linked work; Alex owns the decision.
    expect(d2.people.map((p) => p.person.id)).toEqual(['alex', 'sam']);

    const d1 = decisionImpact(sampleGraph, 'd1');
    // PAY-9 is done, so only open PAY-12 counts as outdated work.
    expect(d1.counts).toEqual({ outdatedWork: 1, outdatedChanges: 0 });
    expect(d1.areas.find((a) => a.kind === 'outdated-work')?.evidence[1]?.id).toBe('PAY-12');
  });

  it('is deterministic and every area carries evidence', () => {
    for (const decision of sampleGraph.decisions) {
      const a = decisionImpact(sampleGraph, decision.ref.id);
      const b = decisionImpact(sampleGraph, decision.ref.id);
      expect(a).toEqual(b);
      for (const area of a.areas) {
        expect(area.evidence.length).toBeGreaterThan(0);
        expect(IMPACT_RULES[area.kind].length).toBeGreaterThan(0);
      }
      expect(a.caveats.length).toBeGreaterThan(0);
    }
  });

  it('throws for an unknown decision', () => {
    expect(() => decisionImpact(sampleGraph, 'nope')).toThrow(/Unknown decision/);
  });
});
