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

/**
 * Jira issue type as the REST payload carries it. `hierarchyLevel` is the
 * language-independent signal (1 = epic, 0 = standard, -1 = sub-task): type
 * NAMES are localized ("Aufgabe", "Épica"), so the level wins when present.
 */
export interface JiraIssueTypeRaw {
  name?: string;
  hierarchyLevel?: number;
  subtask?: boolean;
}

export interface JiraIssueRaw {
  key: string;
  fields: {
    summary?: string;
    status?: { statusCategory?: { key?: string } };
    assignee?: { accountId?: string; displayName?: string; accountType?: string } | null;
    issuetype?: JiraIssueTypeRaw;
    /** The search payload embeds a summary of the parent, including its type. */
    parent?: { key: string; fields?: { summary?: string; issuetype?: JiraIssueTypeRaw } } | null;
  };
}

/**
 * A Jira remote link (GET /rest/api/3/issue/{key}/remotelink). Links created
 * from Confluence carry a `globalId` like "appId=<uuid>&pageId=123" and an
 * object url like ".../wiki/pages/viewpage.action?pageId=123"; links pasted by
 * hand usually carry ".../wiki/spaces/ENG/pages/123/Title".
 */
export interface JiraRemoteLinkRaw {
  globalId?: string;
  application?: { type?: string; name?: string };
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

/**
 * Extract a Confluence page id from the URL shapes Confluence Cloud produces:
 *  - .../wiki/spaces/ENG/pages/123456/Title        (the canonical page URL)
 *  - .../wiki/spaces/ENG/pages/edit-v2/123456      (editor links)
 *  - .../wiki/pages/viewpage.action?pageId=123456  (links created from Confluence)
 *  - appId=<uuid>&pageId=123456                    (a remote link's globalId)
 * Tiny links (/wiki/x/AbCd) are not decoded: their encoding is not a published
 * contract, so a guess could link the wrong page. They are skipped, never guessed.
 */
export function pageIdFromUrl(url: string): string | undefined {
  return (
    /\/pages\/(?:edit-v2\/|edit\/)?(\d+)(?:[/?#]|$)/.exec(url)?.[1] ??
    /[?&]pageId=(\d+)(?:[&#]|$)/.exec(url)?.[1] ??
    /^(?:.*&)?pageId=(\d+)(?:&|$)/.exec(url)?.[1]
  );
}

/**
 * The host of an absolute URL, or undefined for relative or malformed input.
 * Used to keep links that point at ANOTHER Atlassian site from being matched
 * to a local page that happens to share its numeric id.
 */
function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return undefined;
  }
}

/** The page id a remote link points at, or undefined when it is not a page on this site. */
export function pageIdFromRemoteLink(link: JiraRemoteLinkRaw, siteUrl?: string): string | undefined {
  const url = link.object?.url;
  if (url && siteUrl) {
    const linkHost = hostOf(url);
    const siteHost = hostOf(siteUrl);
    if (linkHost && siteHost && linkHost !== siteHost) return undefined;
  }
  return (url ? pageIdFromUrl(url) : undefined) ?? (link.globalId ? pageIdFromUrl(link.globalId) : undefined);
}

/** Work-item type from the payload: the hierarchy level when present (language-proof), else the name. */
export function workItemType(type?: JiraIssueTypeRaw): WorkItemType {
  if (type?.hierarchyLevel === 1) return 'epic';
  if (type?.hierarchyLevel === -1 || type?.subtask === true) return 'task';
  return typeFromName(type?.name);
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
    .map((l) => pageIdFromRemoteLink(l, options.siteUrl))
    .filter((id): id is string => Boolean(id));

  return {
    ref: {
      source: 'jira',
      id: raw.key,
      title: raw.fields.summary ?? raw.key,
      url: options.siteUrl ? `${options.siteUrl}/browse/${raw.key}` : undefined,
    },
    type: workItemType(raw.fields.issuetype),
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

/**
 * Derive decision records from pages by convention: a page whose title starts with
 * "Decision: " is a decision record. Activity data cannot detect approvals or
 * outstanding approvers, so every derived decision stays `proposed` with no pending
 * approvers (coverage-aware: we never flag what the connected data cannot show).
 * The owner is the first recorded contributor; linked work comes from work items
 * whose remote links point at the decision page.
 */
export function deriveDecisions(pages: Page[], workItems: WorkItem[]): Decision[] {
  const workByPageId = new Map<string, string[]>();
  for (const w of workItems) {
    for (const pid of w.linkedPageIds ?? []) {
      const bucket = workByPageId.get(pid);
      if (bucket) {
        if (!bucket.includes(w.ref.id)) bucket.push(w.ref.id);
      } else {
        workByPageId.set(pid, [w.ref.id]);
      }
    }
  }
  for (const ids of workByPageId.values()) ids.sort();

  return pages
    .filter((p) => /^Decision:\s/.test(p.ref.title) && p.contributorIds.length > 0)
    .map((p) => ({
      ref: p.ref,
      ownerId: p.contributorIds[0]!,
      status: 'proposed' as const,
      pendingApproverIds: [],
      linkedWorkItemIds: workByPageId.get(p.ref.id),
    }))
    .sort((a, b) => a.ref.id.localeCompare(b.ref.id));
}
