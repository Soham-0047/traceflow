import { describe, expect, it } from 'vitest';
import { buildGraphIndex, getIndex, graphFingerprint } from '../src/index.js';
import { sampleGraph } from '../src/fixtures.js';

describe('buildGraphIndex', () => {
  const index = buildGraphIndex(sampleGraph);

  it('indexes people, work, epics and children', () => {
    expect(index.peopleById.get('alex')?.name).toBe('Alex Rivera');
    expect(index.workById.get('PAY-15')?.type).toBe('story');
    expect(index.epics.map((e) => e.ref.id)).toEqual(['PAY-1', 'AUTH-1', 'ONB-1']);
    expect((index.childrenByEpic.get('PAY-1') ?? []).map((c) => c.ref.id)).toEqual([
      'PAY-12', 'PAY-15', 'PAY-18', 'PAY-21', 'PAY-9', 'PAY-7',
    ]);
  });

  it('indexes links in both directions', () => {
    expect((index.workByLinkedPageId.get('p1') ?? []).map((w) => w.ref.id)).toEqual(['PAY-1']);
    expect((index.workByLinkedPullRequestId.get('pr-31') ?? []).map((w) => w.ref.id)).toEqual(['PAY-15']);
    expect((index.decisionsByLinkedWorkItemId.get('PAY-12') ?? []).map((d) => d.ref.id)).toEqual(['d1']);
    expect(index.decisionsById.get('d3')?.status).toBe('proposed');
    expect(index.pullRequestsById.get('pr-28')?.state).toBe('merged');
  });

  it('keeps the first record on duplicate ids (never throws)', () => {
    const dup = buildGraphIndex({
      ...sampleGraph,
      people: [...sampleGraph.people, { id: 'alex', name: 'Second Alex' }],
    });
    expect(dup.peopleById.get('alex')?.name).toBe('Alex Rivera');
    expect(dup.peopleById.size).toBe(3);
  });
});

describe('getIndex (memoized)', () => {
  it('returns the same index object for the same graph, and a fresh one per graph', () => {
    expect(getIndex(sampleGraph)).toBe(getIndex(sampleGraph));
    expect(getIndex(sampleGraph)).not.toBe(buildGraphIndex(sampleGraph));
    const other = { ...sampleGraph, people: [...sampleGraph.people] };
    expect(getIndex(other)).not.toBe(getIndex(sampleGraph));
  });
});

describe('graphFingerprint', () => {
  it('is a 16-hex-character key', () => {
    expect(graphFingerprint(sampleGraph)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when data changes', () => {
    const edited = {
      ...sampleGraph,
      decisions: sampleGraph.decisions.map((d) =>
        d.ref.id === 'd1' ? { ...d, status: 'approved' as const } : d,
      ),
    };
    expect(graphFingerprint(edited)).not.toBe(graphFingerprint(sampleGraph));
  });

  it('ignores contributor and link order inside records', () => {
    const reordered = {
      ...sampleGraph,
      pages: sampleGraph.pages.map((p) => ({ ...p, contributorIds: [...p.contributorIds].reverse() })),
      workItems: sampleGraph.workItems.map((w) =>
        w.linkedPageIds ? { ...w, linkedPageIds: [...w.linkedPageIds].reverse() } : w,
      ),
    };
    expect(graphFingerprint(reordered)).toBe(graphFingerprint(sampleGraph));
  });
});
