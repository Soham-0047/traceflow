import { describe, expect, it } from 'vitest';
import { nodeId, sampleGraph, traceDecision, traceEpic } from '../src/index.js';
import type { OrgGraph } from '../src/index.js';

const kinds = (r: { gaps: { kind: string }[] }) => r.gaps.map((g) => g.kind).sort();

describe('traceEpic', () => {
  it('builds the PAY-1 chain across intent, plan, work and code', () => {
    const r = traceEpic(sampleGraph, 'PAY-1');
    const lane = (l: string) => r.nodes.filter((n) => n.lane === l).map((n) => n.ref.id).sort();
    expect(lane('intent')).toEqual(['d1', 'd3', 'p1', 'p5', 'p6']);
    expect(lane('plan')).toEqual(['PAY-1']);
    expect(lane('work')).toEqual(['PAY-12', 'PAY-15', 'PAY-18', 'PAY-21', 'PAY-7', 'PAY-9']);
    expect(lane('code')).toEqual(['pr-28', 'pr-31', 'pr-33']);
    expect(r.edges.some((e) => e.kind === 'implements' && e.from === 'bitbucket:pr-31' && e.to === 'jira:PAY-15')).toBe(true);
    expect(r.edges.some((e) => e.kind === 'specifies' && e.from === 'confluence:p1' && e.to === 'jira:PAY-1')).toBe(true);
  });

  it('every edge connects two nodes that exist', () => {
    for (const id of ['PAY-1', 'AUTH-1', 'ONB-1']) {
      const r = traceEpic(sampleGraph, id);
      const ids = new Set(r.nodes.map((n) => n.id));
      for (const e of r.edges) {
        expect(ids.has(e.from)).toBe(true);
        expect(ids.has(e.to)).toBe(true);
      }
    }
  });

  it('flags finished work with no pull request and work done against a proposed decision', () => {
    const r = traceEpic(sampleGraph, 'PAY-1');
    expect(kinds(r)).toEqual(['done-without-implementation', 'unapproved-decision']);
    const missing = r.gaps.find((g) => g.kind === 'done-without-implementation');
    expect(missing?.evidence.map((e) => e.id)).toEqual(['PAY-7']);
    const unapproved = r.gaps.find((g) => g.kind === 'unapproved-decision');
    expect(unapproved?.evidence.map((e) => e.id)).toEqual(['d1', 'PAY-9']);
  });

  it('flags open work tied to a superseded decision', () => {
    const r = traceEpic(sampleGraph, 'AUTH-1');
    expect(kinds(r)).toEqual(['superseded-decision-in-use']);
  });

  it('flags an epic with no recorded specification', () => {
    const r = traceEpic(sampleGraph, 'ONB-1');
    expect(kinds(r)).toContain('no-recorded-spec');
    expect(r.gaps.find((g) => g.kind === 'no-recorded-spec')?.confidence).toBe('medium');
  });

  it('does not judge implementation when no pull-request data is connected', () => {
    const noCode: OrgGraph = { ...sampleGraph, pullRequests: [] };
    const r = traceEpic(noCode, 'PAY-1');
    expect(r.coverage.code).toBe(false);
    expect(kinds(r)).not.toContain('done-without-implementation');
    expect(r.caveats.join(' ')).toMatch(/pull-request data/);
  });

  it('always carries caveats and evidence', () => {
    const r = traceEpic(sampleGraph, 'PAY-1');
    expect(r.caveats.length).toBeGreaterThan(0);
    for (const g of r.gaps) expect(g.evidence.length).toBeGreaterThan(0);
  });

  it('throws for an unknown epic', () => {
    expect(() => traceEpic(sampleGraph, 'NOPE-1')).toThrow('Unknown epic');
  });

  it('node ids are source-qualified', () => {
    expect(nodeId({ source: 'jira', id: 'PAY-1', title: 'x' })).toBe('jira:PAY-1');
  });
});

describe('traceDecision', () => {
  it('lists linked work, people with roles, and pending-approver findings', () => {
    const r = traceDecision(sampleGraph, 'd1');
    expect(r.linkedWork.map((w) => w.id).sort()).toEqual(['PAY-12', 'PAY-9']);
    const alex = r.people.find((p) => p.person.id === 'alex');
    expect(alex?.roles).toEqual(expect.arrayContaining(['pending approver', 'assignee of linked work']));
    expect(r.findings.map((f) => f.kind).sort()).toEqual(['pending-decision', 'unapproved-decision']);
  });

  it('does not ask a superseded decision for approvals', () => {
    const r = traceDecision(sampleGraph, 'd2');
    expect(r.findings.map((f) => f.kind)).toEqual(['superseded-decision-in-use']);
  });

  it('throws for an unknown decision', () => {
    expect(() => traceDecision(sampleGraph, 'zzz')).toThrow('Unknown decision');
  });
});

describe('RULES', () => {
  it('describes every kind of finding', async () => {
    const { RULES } = await import('../src/index.js');
    for (const kind of ['sole-contributor-page','open-work','open-pull-request','pending-decision','no-recorded-spec','done-without-implementation','unapproved-decision','superseded-decision-in-use'] as const) {
      expect(RULES[kind].length).toBeGreaterThan(10);
    }
  });
});
