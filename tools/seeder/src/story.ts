import type { OrgGraph } from '@traceflow/core';

/**
 * The seed story for a dev site (TF-05): the same fictional org as the sample
 * fixtures, turned into records a real Atlassian site can hold.
 *
 * Real-site notes (honest limits):
 * - Pages and issues are created by the API token owner, so every page shows the
 *   same single recorded contributor. Issue assignees can be any mapped account.
 * - Decisions are pages whose titles follow the "Decision: " convention that
 *   `deriveDecisions` (packages/core) reads on the Forge side.
 */

export interface SeedPage {
  title: string;
  /** Decision pages get a short body noting they are proposed. */
  decision: boolean;
}

export interface SeedIssue {
  summary: string;
  type: 'epic' | 'story' | 'task' | 'bug' | 'other';
  status: 'open' | 'done';
  /** Fictional person id from the sample fixtures; mapped to a real account by SEED_MAP. */
  fictionalAssignee?: string;
  /** Summary of the parent epic, when this issue belongs to one. */
  epicSummary?: string;
  /** Titles of the story pages this issue should link to (remote links). */
  linkedPageTitles: string[];
}

export interface SeedStory {
  pages: SeedPage[];
  issues: SeedIssue[];
}

/** Pages and decisions from the graph all become real Confluence pages. */
export function storyFromGraph(graph: OrgGraph): SeedStory {
  const decisionTitles = new Set(graph.decisions.map((d) => d.ref.title));

  const pageByTitle = (title: string): SeedPage => ({ title, decision: decisionTitles.has(title) });
  const pages: SeedPage[] = [
    ...graph.pages.map((p) => pageByTitle(p.ref.title)),
    ...graph.decisions.map((d) => pageByTitle(d.ref.title)),
  ];

  // Links: work items' linked pages, plus decisions' linked work (reversed).
  const linksByIssueKey = new Map<string, Set<string>>();
  const titleOfPageId = new Map([...graph.pages, ...graph.decisions].map((r) => [r.ref.id, r.ref.title]));
  const addLink = (issueKey: string, pageId: string) => {
    const title = titleOfPageId.get(pageId);
    if (!title) return;
    if (!linksByIssueKey.has(issueKey)) linksByIssueKey.set(issueKey, new Set());
    linksByIssueKey.get(issueKey)!.add(title);
  };
  for (const w of graph.workItems) {
    for (const pid of w.linkedPageIds ?? []) addLink(w.ref.id, pid);
  }
  for (const d of graph.decisions) {
    for (const wid of d.linkedWorkItemIds ?? []) addLink(wid, d.ref.id);
  }

  const summaryByKey = new Map(graph.workItems.map((w) => [w.ref.id, w.ref.title]));
  const issues: SeedIssue[] = graph.workItems.map((w) => ({
    summary: w.ref.title,
    type: w.type ?? 'other',
    status: w.status,
    fictionalAssignee: w.assigneeId,
    epicSummary: w.epicId ? summaryByKey.get(w.epicId) : undefined,
    linkedPageTitles: [...(linksByIssueKey.get(w.ref.id) ?? [])],
  }));

  return { pages, issues };
}
