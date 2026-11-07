import type { Decision, OrgGraph, Page, Person, PullRequest, WorkItem } from './types.js';

/**
 * Precomputed lookup structures over an OrgGraph. Built once per graph object
 * and memoized (WeakMap), so every engine function and every surface — risk,
 * lineage, impact, overview, answers, the MCP tools — shares one index instead
 * of re-scanning arrays with `filter`/`find` inside loops.
 *
 * Graphs are treated as immutable: build a new graph (or re-run the pipeline)
 * after mutating source data.
 */
export interface GraphIndex {
  peopleById: Map<string, Person>;
  /** Every work item (epics included) by record id. */
  workById: Map<string, WorkItem>;
  /** Epic records only, in graph order. */
  epics: WorkItem[];
  /** Non-epic children of each epic id (empty array when an epic has none). */
  childrenByEpic: Map<string, WorkItem[]>;
  pagesById: Map<string, Page>;
  /** Decisions keyed by their record id (the underlying Confluence page id). */
  decisionsById: Map<string, Decision>;
  pullRequestsById: Map<string, PullRequest>;
  /** Work items that link to a page or decision id (remote links, Confluence space). */
  workByLinkedPageId: Map<string, WorkItem[]>;
  /** Work items that link to a pull-request id. */
  workByLinkedPullRequestId: Map<string, WorkItem[]>;
  /** Decisions that name a work item in `linkedWorkItemIds`. */
  decisionsByLinkedWorkItemId: Map<string, Decision[]>;
}

function pushTo<K>(map: Map<K, unknown[]>, key: K, value: unknown): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

export function buildGraphIndex(graph: OrgGraph): GraphIndex {
  const peopleById = new Map<string, Person>();
  for (const person of graph.people) if (!peopleById.has(person.id)) peopleById.set(person.id, person);

  const workById = new Map<string, WorkItem>();
  const epics: WorkItem[] = [];
  const childrenByEpic = new Map<string, WorkItem[]>();
  const workByLinkedPageId = new Map<string, WorkItem[]>();
  const workByLinkedPullRequestId = new Map<string, WorkItem[]>();
  for (const item of graph.workItems) {
    if (!workById.has(item.ref.id)) workById.set(item.ref.id, item);
    if (item.type === 'epic') {
      epics.push(item);
    } else if (item.epicId) {
      pushTo(childrenByEpic, item.epicId, item);
    }
    for (const pageId of item.linkedPageIds ?? []) pushTo(workByLinkedPageId, pageId, item);
    for (const prId of item.linkedPullRequestIds ?? []) pushTo(workByLinkedPullRequestId, prId, item);
  }

  const pagesById = new Map<string, Page>();
  for (const page of graph.pages) if (!pagesById.has(page.ref.id)) pagesById.set(page.ref.id, page);

  const decisionsById = new Map<string, Decision>();
  const decisionsByLinkedWorkItemId = new Map<string, Decision[]>();
  for (const decision of graph.decisions) {
    if (!decisionsById.has(decision.ref.id)) decisionsById.set(decision.ref.id, decision);
    for (const workId of decision.linkedWorkItemIds ?? []) {
      pushTo(decisionsByLinkedWorkItemId, workId, decision);
    }
  }

  const pullRequestsById = new Map<string, PullRequest>();
  for (const pr of graph.pullRequests) {
    if (!pullRequestsById.has(pr.ref.id)) pullRequestsById.set(pr.ref.id, pr);
  }

  return {
    peopleById,
    workById,
    epics,
    childrenByEpic,
    pagesById,
    decisionsById,
    pullRequestsById,
    workByLinkedPageId,
    workByLinkedPullRequestId,
    decisionsByLinkedWorkItemId,
  };
}

const INDEX_CACHE = new WeakMap<OrgGraph, GraphIndex>();

/** The shared index for a graph, built on first use and reused after that. */
export function getIndex(graph: OrgGraph): GraphIndex {
  const cached = INDEX_CACHE.get(graph);
  if (cached) return cached;
  const index = buildGraphIndex(graph);
  INDEX_CACHE.set(graph, index);
  return index;
}

/* ------------------------------------------------------------------ *
 * Fingerprint
 * ------------------------------------------------------------------ */

/** FNV-1a (32-bit) with a caller-chosen seed; returns 8 hex characters. */
function fnv1a(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const sortedUniq = (ids: readonly string[] | undefined): string[] =>
  ids ? [...new Set(ids)].sort() : [];

/**
 * A short, stable identity for a graph's *data*: same records in any order
 * produce the same fingerprint; any change to people, work, links, pages,
 * pull requests or decisions produces a different one. Presentation-only
 * fields (urls) are excluded on purpose, and ids inside a record are sorted,
 * so re-ordering contributors or linked ids does not invalidate caches.
 *
 * This is a change-detection key, not a cryptographic hash (two different
 * graphs can collide with probability ~2^-64). It uses no platform crypto so
 * the core stays dependency-free and browser-safe.
 */
export function graphFingerprint(graph: OrgGraph): string {
  const key = (source: string, id: string): string => `${source}:${id}`;

  const parts: string[] = [];
  const emit = (label: string, lines: string[]): void => {
    lines.sort();
    parts.push(`${label}|${lines.length}|${lines.join(';')}`);
  };

  emit('people', graph.people.map((p) => `${p.id}=${p.name}`));

  emit('work', graph.workItems.map((w) =>
    JSON.stringify([
      key(w.ref.source, w.ref.id),
      w.ref.title,
      w.type ?? null,
      w.assigneeId ?? null,
      w.status,
      w.epicId ?? null,
      sortedUniq(w.linkedPageIds),
      sortedUniq(w.linkedPullRequestIds),
    ]),
  ));

  emit('pages', graph.pages.map((p) =>
    JSON.stringify([key(p.ref.source, p.ref.id), p.ref.title, sortedUniq(p.contributorIds)]),
  ));

  emit('prs', graph.pullRequests.map((p) =>
    JSON.stringify([
      key(p.ref.source, p.ref.id),
      p.ref.title,
      p.authorId,
      p.state,
      sortedUniq(p.reviewerIds),
    ]),
  ));

  emit('decisions', graph.decisions.map((d) =>
    JSON.stringify([
      key(d.ref.source, d.ref.id),
      d.ref.title,
      d.ownerId,
      d.status,
      sortedUniq(d.pendingApproverIds),
      sortedUniq(d.linkedWorkItemIds),
    ]),
  ));

  const canonical = parts.join('\n');
  // Two independent 32-bit lanes: effectively a 64-bit change-detection key.
  return `${fnv1a(canonical, 0x811c9dc5)}${fnv1a(canonical, 0x01000193)}`;
}
