import type { SeedIssue, SeedStory } from './story';

/**
 * The pure, idempotent planner: given the story and the current site state,
 * return only the operations still needed. Everything here is unit-tested;
 * only `atlassian.ts` talks to a real site.
 */

export interface SiteIssueState {
  key: string;
  summary: string;
  statusCategory: 'new' | 'indeterminate' | 'done';
  assigneeAccountId?: string;
}

export interface SitePageState {
  id: string;
  title: string;
}

export interface SiteState {
  issues: SiteIssueState[];
  /** Existing remote links per issue key (URLs). */
  remoteLinks: Record<string, string[]>;
  pages: SitePageState[];
}

export type SeedOp =
  | { op: 'create-page'; title: string; decision: boolean }
  | { op: 'create-issue'; issue: SeedIssue }
  | { op: 'assign-issue'; key: string; accountId: string; summary: string }
  | { op: 'transition-issue'; key: string; summary: string }
  | { op: 'link-issue-to-page'; key: string; summary: string; pageTitle: string };

export interface SeedOptions {
  /** fictional person id -> real account id. Unmapped people stay unassigned. */
  map: Record<string, string>;
}

export const SEED_LABEL = 'traceflow-seed';

/**
 * Diff the story against the site. Re-running on a fully seeded site returns
 * an empty plan (that is the idempotency contract TF-05 is done against).
 */
export function planSeed(story: SeedStory, state: SiteState, options: SeedOptions): SeedOp[] {
  const ops: SeedOp[] = [];

  const existingPageTitles = new Set(state.pages.map((p) => p.title));
  for (const page of story.pages) {
    if (!existingPageTitles.has(page.title)) {
      ops.push({ op: 'create-page', title: page.title, decision: page.decision });
    }
  }

  const issueBySummary = new Map(state.issues.map((i) => [i.summary, i]));
  const createdSummaries = new Set<string>();
  for (const issue of story.issues) {
    if (issueBySummary.has(issue.summary)) continue;
    ops.push({ op: 'create-issue', issue });
    createdSummaries.add(issue.summary);
  }

  for (const issue of story.issues) {
    const existing = issueBySummary.get(issue.summary);
    if (!existing) continue;

    if (issue.status === 'done' && existing.statusCategory !== 'done') {
      ops.push({ op: 'transition-issue', key: existing.key, summary: existing.summary });
    }

    const accountId = issue.fictionalAssignee ? options.map[issue.fictionalAssignee] : undefined;
    if (accountId && existing.assigneeAccountId !== accountId) {
      ops.push({ op: 'assign-issue', key: existing.key, accountId, summary: existing.summary });
    }
  }

  for (const issue of story.issues) {
    const existing = issueBySummary.get(issue.summary);
    if (!existing) continue;
    const links = new Set(state.remoteLinks[existing.key] ?? []);
    for (const title of issue.linkedPageTitles) {
      const page = state.pages.find((p) => p.title === title);
      // Only when the page already exists; a page created in this same run is
      // linked by the apply step right after creation.
      if (!page) continue;
      const url = `/pages/${page.id}`;
      if (![...links].some((l) => l.includes(url))) {
        ops.push({ op: 'link-issue-to-page', key: existing.key, summary: existing.summary, pageTitle: title });
      }
    }
  }

  return ops;
}

/** Group ops for readable dry-run output. */
export function summarizeOps(ops: SeedOp[]): Record<string, number> {
  return ops.reduce<Record<string, number>>((acc, op) => {
    acc[op.op] = (acc[op.op] ?? 0) + 1;
    return acc;
  }, {});
}
