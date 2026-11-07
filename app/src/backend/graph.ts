import { requestConfluence, requestJira, route } from '@forge/api';
import type { APIResponse } from '@forge/api';
import { buildOrgGraph, deriveDecisions } from '@traceflow/core';
import type {
  ConfluencePageRaw,
  JiraIssueRaw,
  JiraRemoteLinkRaw,
  OrgGraph,
  Person,
} from '@traceflow/core';

/*
 * UNVERIFIED (spike S1, docs/SPIKES.md): every payload shape and endpoint below is
 * written from public API knowledge and has NOT been run against a live site.
 * Fix what S1 breaks here; the normalizers in packages/core stay the contract.
 *
 * $0 guardrails (docs/PLAN.md §11): paginated reads, a hard cap on the per-issue
 * remote-link fan-out, and the whole graph is cached by the resolver (see index.ts).
 */

const JIRA_PAGE_SIZE = 50;
const MAX_JIRA_ISSUES = 200;
/** Remote links are one call per issue; cap the fan-out, epics and their children first. */
const MAX_REMOTE_LINK_CALLS = 50;
const CONFLUENCE_PAGE_SIZE = 50;
const MAX_CONFLUENCE_PAGES = 150;

interface JiraSearchResponse {
  issues?: JiraIssueRaw[];
  total?: number;
  startAt?: number;
}

interface ConfluenceContentResponse {
  results?: ConfluenceContentRaw[];
  size?: number;
  start?: number;
}

interface ConfluenceContentRaw extends ConfluencePageRaw {
  history?: {
    contributors?: {
      publish?: { users?: { results?: { accountId?: string }[] } };
      users?: { results?: { accountId?: string }[] };
    };
    lastUpdated?: { by?: { accountId?: string } };
  };
}

async function fetchJson<T>(request: () => Promise<APIResponse>): Promise<T> {
  const response = await request();
  if (!response.ok) {
    throw new Error(`Upstream request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/** Everyone with an issue assigned, plus everyone with a recorded page contribution. */
function collectPeople(issues: JiraIssueRaw[], pageContributorIds: string[][]): Person[] {
  const byId = new Map<string, Person>();
  for (const issue of issues) {
    const { accountId, displayName } = issue.fields.assignee ?? {};
    if (accountId && !byId.has(accountId)) {
      byId.set(accountId, { id: accountId, name: displayName ?? accountId });
    }
  }
  for (const ids of pageContributorIds) {
    for (const id of ids) {
      if (!byId.has(id)) byId.set(id, { id, name: id });
    }
  }
  return [...byId.values()];
}

/** Tolerant contributor extraction: try the known expand shapes, fall back to the last updater. */
function contributorIdsOf(content: ConfluenceContentRaw): string[] {
  const users =
    content.history?.contributors?.publish?.users?.results ??
    content.history?.contributors?.users?.results ??
    [];
  const ids = users.map((u) => u.accountId).filter((id): id is string => Boolean(id));
  if (ids.length > 0) return [...new Set(ids)];
  const last = content.history?.lastUpdated?.by?.accountId;
  return last ? [last] : [];
}

async function fetchJiraIssues(): Promise<JiraIssueRaw[]> {
  const issues: JiraIssueRaw[] = [];
  let startAt = 0;
  while (issues.length < MAX_JIRA_ISSUES) {
    const page = await fetchJson<JiraSearchResponse>(() =>
      requestJira(
        route`/rest/api/3/search?jql=${'type in (Epic, Story, Task, Bug) ORDER BY updated DESC'}&maxResults=${JIRA_PAGE_SIZE}&startAt=${startAt}&fields=${'summary,status,assignee,issuetype,parent'}`,
      ),
    );
    issues.push(...(page.issues ?? []));
    if ((page.issues ?? []).length === 0 || issues.length >= (page.total ?? 0)) break;
    startAt += JIRA_PAGE_SIZE;
  }
  return issues.slice(0, MAX_JIRA_ISSUES);
}

/**
 * Remote links per issue are the only supported way to see Jira -> Confluence links.
 * To respect the fan-out guardrail, only epics and issues with an epic parent are
 * fetched, capped at MAX_REMOTE_LINK_CALLS.
 */
async function fetchRemoteLinks(issues: JiraIssueRaw[]): Promise<Record<string, JiraRemoteLinkRaw[]>> {
  const epicKeys = new Set(
    issues.filter((i) => i.fields.issuetype?.name?.toLowerCase() === 'epic').map((i) => i.key),
  );
  const linked = issues.filter((i) => epicKeys.has(i.key) || i.fields.parent?.key);
  const links: Record<string, JiraRemoteLinkRaw[]> = {};
  for (const issue of linked.slice(0, MAX_REMOTE_LINK_CALLS)) {
    links[issue.key] = await fetchJson<JiraRemoteLinkRaw[]>(() =>
      requestJira(route`/rest/api/3/issue/${issue.key}/remotelink`),
    );
  }
  return links;
}

async function fetchConfluencePages(): Promise<{ raw: ConfluencePageRaw; contributorIds: string[] }[]> {
  const pages: { raw: ConfluencePageRaw; contributorIds: string[] }[] = [];
  let start = 0;
  while (pages.length < MAX_CONFLUENCE_PAGES) {
    const page = await fetchJson<ConfluenceContentResponse>(() =>
      requestConfluence(
        route`/wiki/rest/api/content?type=page&limit=${CONFLUENCE_PAGE_SIZE}&start=${start}&expand=${'history.contributors,history.lastUpdated'}`,
      ),
    );
    for (const content of page.results ?? []) {
      pages.push({
        raw: { id: content.id, title: content.title, _links: content._links },
        contributorIds: contributorIdsOf(content),
      });
    }
    if ((page.results ?? []).length === 0 || pages.length >= (page.size ?? 0)) break;
    start += CONFLUENCE_PAGE_SIZE;
  }
  return pages.slice(0, MAX_CONFLUENCE_PAGES);
}

/**
 * Build the OrgGraph for the current site. Called by the resolver, which caches
 * the result. UNVERIFIED until spike S1 runs against a real dev site.
 */
export async function loadOrgGraphFromSite(siteUrl?: string): Promise<OrgGraph> {
  const issues = await fetchJiraIssues();
  const [remoteLinks, pages] = await Promise.all([fetchRemoteLinks(issues), fetchConfluencePages()]);

  const people = collectPeople(issues, pages.map((p) => p.contributorIds));

  const partial = buildOrgGraph({ issues, remoteLinks, pages, people, siteUrl });
  const decisions = deriveDecisions(partial.pages, partial.workItems);

  // Pull requests: no supported Bitbucket path yet (decision D2), so none are connected.
  return { ...partial, decisions };
}
