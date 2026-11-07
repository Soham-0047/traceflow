import { describe, expect, it } from 'vitest';
import { sampleGraph } from '@traceflow/core';
import { planSeed, summarizeOps } from '../src/plan';
import type { SiteState } from '../src/plan';
import { storyFromGraph } from '../src/story';

const map: Record<string, string> = { alex: 'acc-alex', sam: 'acc-sam', priya: 'acc-priya' };
const story = storyFromGraph(sampleGraph);

/** The state of a site that already holds the whole story. */
const fullySeededState = (): SiteState => {
  const pages = story.pages.map((p, i) => ({ id: String(1000 + i), title: p.title }));
  const issues = story.issues.map((issue, i) => ({
    key: `SEED-${i + 1}`,
    summary: issue.summary,
    statusCategory: issue.status === 'done' ? ('done' as const) : ('indeterminate' as const),
    assigneeAccountId: issue.fictionalAssignee ? map[issue.fictionalAssignee] : undefined,
  }));
  const remoteLinks: Record<string, string[]> = {};
  for (const issue of story.issues) {
    const key = issues.find((i) => i.summary === issue.summary)!.key;
    remoteLinks[key] = issue.linkedPageTitles.map((title) => {
      const page = pages.find((p) => p.title === title)!;
      return `https://x.atlassian.net/wiki/spaces/ENG/pages/${page.id}/x`;
    });
  }
  return { issues, remoteLinks, pages };
};

const emptyState: SiteState = { issues: [], remoteLinks: {}, pages: [] };

describe('storyFromGraph', () => {
  it('turns pages and decisions into Confluence pages and keeps the links', () => {
    expect(story.pages).toHaveLength(12); // 9 pages + 3 decisions from the fixtures
    expect(story.pages.filter((p) => p.decision)).toHaveLength(3);
    expect(story.issues).toHaveLength(11);

    const pay15 = story.issues.find((i) => i.summary === 'Add idempotency keys')!;
    expect(pay15.epicSummary).toBe('Payments reliability');
    expect(pay15.linkedPageTitles).toEqual(['Idempotency design notes', 'Decision: idempotency key scope']);
  });
});

describe('planSeed', () => {
  it('plans the full story on an empty site', () => {
    const ops = planSeed(story, emptyState, { map });
    expect(summarizeOps(ops)).toEqual({
      'create-page': 12,
      'create-issue': 11,
    });
  });

  it('plans nothing on a fully seeded site (idempotency)', () => {
    expect(planSeed(story, fullySeededState(), { map })).toEqual([]);
  });

  it('plans only what drifted: a missing page, a reopened issue, an unassigned and an unlinked one', () => {
    const state = fullySeededState();
    state.pages = state.pages.filter((p) => p.title !== 'Onboarding guide');
    const reopened = state.issues.find((i) => i.summary === 'Retry backoff tuning')!;
    reopened.statusCategory = 'indeterminate';
    const unassigned = state.issues.find((i) => i.summary === 'Rotate signing keys')!;
    unassigned.assigneeAccountId = undefined;
    const linkKey = state.issues.find((i) => i.summary === 'Fix duplicate charge on retry')!.key;
    state.remoteLinks[linkKey] = [];

    const ops = planSeed(story, state, { map });
    expect(summarizeOps(ops)).toEqual({
      'create-page': 1,
      'transition-issue': 1,
      'assign-issue': 1,
      'link-issue-to-page': 2,
    });
    expect(ops).toContainEqual({ op: 'create-page', title: 'Onboarding guide', decision: false });
    expect(ops).toContainEqual({ op: 'transition-issue', key: reopened.key, summary: 'Retry backoff tuning' });
    expect(ops).toContainEqual({ op: 'assign-issue', key: unassigned.key, accountId: 'acc-sam', summary: 'Rotate signing keys' });
    expect(ops).toContainEqual({
      op: 'link-issue-to-page',
      key: linkKey,
      summary: 'Fix duplicate charge on retry',
      pageTitle: 'Postmortem: duplicate charge',
    });
    expect(ops).toContainEqual({
      op: 'link-issue-to-page',
      key: linkKey,
      summary: 'Fix duplicate charge on retry',
      pageTitle: 'Decision: queue vs cron for retries',
    });
  });

  it('leaves unmapped people unassigned instead of guessing', () => {
    const state = fullySeededState();
    for (const issue of state.issues) issue.assigneeAccountId = undefined;
    const ops = planSeed(story, state, { map: {} });
    expect(ops.filter((op) => op.op === 'assign-issue')).toEqual([]);
  });
});
