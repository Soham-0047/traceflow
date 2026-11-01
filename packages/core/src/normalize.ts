import type {
  Decision,
  OrgGraph,
  Page,
  Person,
  PullRequest,
  WorkItem,
  WorkItemType,
} from './types.js';

/*
 * Minimal structural subsets of the Jira Cloud and Confluence Cloud REST payloads
 * that TraceFlow reads. They are written from public API knowledge and have NOT yet
 * been validated against a live site: that is validation spike S1 (docs/SPIKES.md).
 */

export interface JiraIssueRaw {
  key: string;
  fields: {
    summary?: string;
    status?: { statusCategory?: { key?: string } };
    assignee?: { accountId?: string; displayName?: string } | null;
    issuetype?: { name?: string };
    parent?: { key: string } | null;
  };
}

export interface JiraRemoteLinkRaw {
  object?: { url?: string; title?: string };
}

export interface ConfluencePageRaw {
  id: string;
  title: string;
  _links?: { webui?: string };
}

export interface BuildGraphInput {
  issues: JiraIssueRaw[];
  /** Remote links keyed by issue key (Jira: GET /rest/api/3/issue/{key}/remotelink). */
  remoteLinks?: Record<string, JiraRemoteLinkRaw[]>;
  /** Pages with the account ids of everyone with a recorded version. */
  pages: { raw: ConfluencePageRaw; contributorIds: string[] }[];
  people: Person[];
  pullRequests?: PullRequest[];
  decisions?: Decision[];
  /** e.g. https://your-site.atlassian.net (no trailing slash). Used only to build links. */
  siteUrl?: string;
}

/** Extract a Confluence page id from a URL like .../wiki/spaces/ENG/pages/123456/Title. */
export function pageIdFromUrl(url: string): string | undefined {
  return /\/pages\/(\d+)/.exec(url)?.[1];
}

function typeFromName(name?: string): WorkItemType {
  switch (name?.toLowerCase()) {
    case 'epic':
      return 'epic';
    case 'story':
      return 'story';
    case 'task':
    case 'sub-task':
    case 'subtask':
      return 'task';
    case 'bug':
      return 'bug';
    default:
      return 'other';
  }
}

export function workItemFromJira(
  raw: JiraIssueRaw,
  options: { remoteLinks?: JiraRemoteLinkRaw[]; siteUrl?: string } = {},
): WorkItem {
  const linkedPageIds = (options.remoteLinks ?? [])
    .map((l) => (l.object?.url ? pageIdFromUrl(l.object.url) : undefined))
    .filter((id): id is string => Boolean(id));

  return {
    ref: {
      source: 'jira',
      id: raw.key,
      title: raw.fields.summary ?? raw.key,
      url: options.siteUrl ? `${options.siteUrl}/browse/${raw.key}` : undefined,
    },
    type: typeFromName(raw.fields.issuetype?.name),
    assigneeId: raw.fields.assignee?.accountId,
    status: raw.fields.status?.statusCategory?.key === 'done' ? 'done' : 'open',
    epicId: raw.fields.parent?.key,
    linkedPageIds: linkedPageIds.length > 0 ? [...new Set(linkedPageIds)] : undefined,
  };
}

export function pageFromConfluence(
  raw: ConfluencePageRaw,
  contributorIds: string[],
  options: { siteUrl?: string } = {},
): Page {
  const webui = raw._links?.webui;
  let url: string | undefined;
  if (options.siteUrl && webui) {
    url = webui.startsWith('/wiki') ? `${options.siteUrl}${webui}` : `${options.siteUrl}/wiki${webui}`;
  }
  return {
    ref: { source: 'confluence', id: raw.id, title: raw.title, url },
    contributorIds: [...new Set(contributorIds)],
  };
}

/** Assemble an OrgGraph from raw Jira and Confluence records. */
export function buildOrgGraph(input: BuildGraphInput): OrgGraph {
  const workItems = input.issues.map((issue) =>
    workItemFromJira(issue, {
      remoteLinks: input.remoteLinks?.[issue.key],
      siteUrl: input.siteUrl,
    }),
  );

  // A parent only counts as an epic if it really is one in this data set.
  const epicIds = new Set(workItems.filter((w) => w.type === 'epic').map((w) => w.ref.id));
  for (const w of workItems) {
    if (w.epicId && !epicIds.has(w.epicId)) w.epicId = undefined;
  }

  return {
    people: input.people,
    workItems,
    pages: input.pages.map((p) => pageFromConfluence(p.raw, p.contributorIds, { siteUrl: input.siteUrl })),
    pullRequests: input.pullRequests ?? [],
    decisions: input.decisions ?? [],
  };
}
