import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  parseOrgGraphJson,
  sanitizeGraph,
  strictGraph,
  validateGraph,
} from '../src/index.js';
import { ValidationError } from '../src/index.js';
import { sampleGraph } from '../src/fixtures.js';
import type { OrgGraph } from '../src/index.js';

describe('validateGraph', () => {
  it('accepts the sample fixtures with zero issues', () => {
    const report = validateGraph(sampleGraph);
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('rejects a non-object graph with a root-level path', () => {
    for (const bad of [null, 42, 'nope', [], true]) {
      const report = validateGraph(bad);
      expect(report.ok).toBe(false);
      expect(report.errors[0]?.path).toBe('$');
    }
  });

  it('reports the exact path of a broken record', () => {
    const graph = {
      ...sampleGraph,
      pages: [
        ...sampleGraph.pages,
        { ref: { source: 'confluence', id: '', title: 'Broken page' }, contributorIds: ['alex'] },
      ],
    };
    const report = validateGraph(graph);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.path === '$.pages[9].ref.id' && /must not be empty/.test(e.message))).toBe(true);
  });

  it('rejects wrong field types and bad enum values per record', () => {
    const report = validateGraph({
      people: [{ id: 'x', name: 7 }],
      workItems: [{ ref: { source: 'github', id: 'W-1', title: 't' }, status: 'wednesday' }],
      pages: [],
      pullRequests: [],
      decisions: [],
    });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.path === '$.people[0].name')).toBe(true);
    expect(report.errors.some((e) => e.path === '$.workItems[0].ref.source')).toBe(true);
    expect(report.errors.some((e) => e.path === '$.workItems[0].status')).toBe(true);
  });

  it('rejects control characters in strings', () => {
    const report = validateGraph({
      ...sampleGraph,
      people: [{ id: 'p\nx', name: 'Bad\u0000Id' }],
    });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.path === '$.people[0].id' && /control/.test(e.message))).toBe(true);
  });

  it('rejects dangerous property names (prototype pollution vector)', () => {
    const hostile = JSON.parse(
      '{"people":[{"id":"a","name":"A"}],"workItems":[],"pages":[],"pullRequests":[],"decisions":[],"__proto__":{"polluted":true}}',
    );
    const report = validateGraph(hostile);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.path === '$.__proto__')).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('enforces collection caps', () => {
    const people = Array.from({ length: LIMITS.maxPeople + 1 }, (_, i) => ({ id: `p${i}`, name: `P ${i}` }));
    const report = validateGraph({ ...sampleGraph, people });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.path === '$.people' && /cap/.test(e.message))).toBe(true);
  });

  it('rejects duplicate ids within a collection but allows page/decision id overlap', () => {
    const dup = validateGraph({ ...sampleGraph, people: [...sampleGraph.people, { id: 'alex', name: 'Fake Alex' }] });
    expect(dup.ok).toBe(false);
    expect(dup.errors.some((e) => /duplicate id 'alex'/.test(e.message))).toBe(true);

    // A derived decision shares its id with the underlying page: legitimate.
    const shared = validateGraph({
      ...sampleGraph,
      decisions: [...sampleGraph.decisions, { ref: { source: 'confluence', id: 'p1', title: 'Decision: p1' }, ownerId: 'alex', status: 'proposed', pendingApproverIds: [] }],
    });
    expect(shared.ok).toBe(true);
  });

  it('reports dangling cross-references as warnings, not errors', () => {
    const report = validateGraph({
      ...sampleGraph,
      workItems: sampleGraph.workItems.map((w) =>
        w.ref.id === 'PAY-12' ? { ...w, assigneeId: 'ghost' } : w,
      ),
    });
    expect(report.ok).toBe(true);
    expect(report.warnings.some((w) => w.path === '$.workItems[1].assigneeId' && /ghost/.test(w.message))).toBe(true);
  });
});

describe('strictGraph', () => {
  it('returns the same graph object when valid', () => {
    const { graph, warnings } = strictGraph(sampleGraph);
    expect(graph).toBe(sampleGraph);
    expect(warnings).toEqual([]);
  });

  it('throws a ValidationError listing every issue with paths', () => {
    expect(() => strictGraph({ people: 'nope' })).toThrow(ValidationError);
    try {
      strictGraph({ people: [{ id: '', name: '' }] });
      expect.unreachable();
    } catch (err) {
      const e = err as ValidationError;
      expect(e.issues.length).toBeGreaterThanOrEqual(2);
      expect(e.message).toContain('$.people[0].id');
      expect(e.message).toContain('$.people[0].name');
    }
  });
});

describe('sanitizeGraph', () => {
  const broken: OrgGraph = {
    people: [...sampleGraph.people, { id: 'alex', name: 'Duplicate Alex' }],
    workItems: [
      ...sampleGraph.workItems,
      // Quarantined: status is not an enum value.
      { ref: { source: 'jira', id: 'BAD-1', title: 'Broken' }, status: 'wednesday' as never },
      // Dangling refs to drop: unknown assignee, unknown epic, unknown page, unknown pr.
      { ref: { source: 'jira', id: 'PAY-99', title: 'Dangling' }, assigneeId: 'ghost', epicId: 'NOPE-1', status: 'open', linkedPageIds: ['p1', 'missing-page'], linkedPullRequestIds: ['pr-31', 'pr-ghost'] },
    ],
    pages: [...sampleGraph.pages, { ref: { source: 'confluence', id: 'p10', title: 'Orphan refs' }, contributorIds: ['priya', 'ghost2'] }],
    pullRequests: sampleGraph.pullRequests,
    decisions: sampleGraph.decisions,
  };

  it('quarantines broken records instead of failing the whole graph', () => {
    const { graph, rejected } = sanitizeGraph(broken);
    expect(rejected.some((r) => r.path === '$.people[3]')).toBe(true);
    expect(rejected.some((r) => r.path === '$.workItems[11]')).toBe(true);
    expect(graph.people).toHaveLength(3);
    expect(graph.workItems.some((w) => w.ref.id === 'BAD-1')).toBe(false);
    expect(graph.workItems.some((w) => w.ref.id === 'PAY-99')).toBe(true);
  });

  it('drops dangling cross-references and says so in warnings', () => {
    const { graph, warnings } = sanitizeGraph(broken);
    const pay99 = graph.workItems.find((w) => w.ref.id === 'PAY-99')!;
    expect(pay99.assigneeId).toBeUndefined();
    expect(pay99.epicId).toBeUndefined();
    expect(pay99.linkedPageIds).toEqual(['p1']);
    expect(pay99.linkedPullRequestIds).toEqual(['pr-31']);
    const p10 = graph.pages.find((p) => p.ref.id === 'p10')!;
    expect(p10.contributorIds).toEqual(['priya']);
    expect(warnings.some((w) => /ghost/.test(w.message))).toBe(true);
    expect(warnings.some((w) => /missing-page/.test(w.message))).toBe(true);
  });

  it('never mutates the input', () => {
    const before = JSON.stringify(broken);
    sanitizeGraph(broken);
    expect(JSON.stringify(broken)).toBe(before);
  });

  it('still throws when the whole shape is wrong', () => {
    expect(() => sanitizeGraph({ people: 'nope' })).toThrow(ValidationError);
    expect(() => sanitizeGraph(null)).toThrow(ValidationError);
  });

  it('keeps required owner/author ids even when dangling (warned, engine-safe)', () => {
    const { graph, warnings } = sanitizeGraph({
      ...sampleGraph,
      decisions: sampleGraph.decisions.map((d) => (d.ref.id === 'd1' ? { ...d, ownerId: 'ghost-owner' } : d)),
    });
    const d1 = graph.decisions.find((d) => d.ref.id === 'd1')!;
    expect(d1.ownerId).toBe('ghost-owner');
    expect(warnings.some((w) => /ghost-owner/.test(w.message))).toBe(true);
    // And the engine survives it: no person matches a ghost owner.
    expect(() => graph.people.find((p) => p.id === 'ghost-owner')).not.toThrow();
  });
});

describe('parseOrgGraphJson', () => {
  it('parses a valid export and surfaces cross-reference warnings', () => {
    const { graph, warnings } = parseOrgGraphJson(JSON.stringify(sampleGraph));
    expect(graph.people).toHaveLength(3);
    expect(warnings).toEqual([]);
  });

  it('rejects invalid JSON, non-object JSON and oversize text', () => {
    expect(() => parseOrgGraphJson('{nope')).toThrow(ValidationError);
    expect(() => parseOrgGraphJson('[1,2,3]')).toThrow(ValidationError);
    expect(() => parseOrgGraphJson('x'.repeat(LIMITS.maxJsonBytes + 1))).toThrow(ValidationError);
  });

  it('lists per-record issues from a corrupt export', () => {
    const corrupt = JSON.stringify({ ...sampleGraph, pages: [{ ref: { source: 'confluence', id: 'p1', title: 'No contributors' } }] });
    try {
      parseOrgGraphJson(corrupt);
      expect.unreachable();
    } catch (err) {
      const e = err as ValidationError;
      expect(e.issues.some((i) => i.path === '$.pages[0].contributorIds')).toBe(true);
    }
  });
});
