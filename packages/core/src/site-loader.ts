import { buildOrgGraph, deriveDecisions, pageIdFromRemoteLink, workItemType } from './normalize.js';
import type { ConfluencePageRaw, JiraIssueRaw, JiraRemoteLinkRaw } from './normalize.js';
import type { OrgGraph, Person } from './types.js';

/*
 * The one way TraceFlow reads a live Atlassian site, shared by every host:
 * the Forge app (requester = api.asUser().requestJira/requestConfluence), the
 * API-token CLI and MCP source (requester = fetch with Basic auth), and the
 * tests (requester = recorded payloads). The loader only builds paths and
 * interprets JSON; transport, auth and permissions belong to the requester.
 *
 * Endpoints, checked against Atlassian's published changes (session 18):
 *  - Jira issues: GET /rest/api/3/search/jql (the "enhanced search"). The old
 *    /rest/api/3/search was removed from Jira Cloud and answers 410 Gone. The
 *    new endpoint pages with an opaque nextPageToken (no startAt, no total),
 *    returns only ids unless `fields` is passed, rejects unbounded JQL with a
 *    400, and has a documented bug where a token can return the same page
 *    forever, so the loop stops on a repeated token or a page with no new keys.
 *  - Jira remote links: GET /rest/api/3/issue/{key}/remotelink (one call per
 *    issue; the only supported way to see Jira -> Confluence links).
 *  - Jira users: GET /rest/api/3/user/bulk (display names for contributor
 *    account ids that Confluence's v2 API returns without names).
 *  - Confluence pages: GET /wiki/api/v2/pages (cursor pagination through
 *    `_links.next`). The v1 content API is on Atlassian's deprecation path.
 *  - Confluence history: GET /wiki/api/v2/pages/{id}/versions (who edited).
 *
 * Coverage rules (AGENTS.md: never flag what the connected data cannot show):
 *  - A page edited once has exactly one contributor (its author): exact.
 *  - A page whose author differs from its last editor has at least two
 *    contributors, so it can never be a "sole contributor" page: safe.
 *  - A page with several versions by the SAME author and last editor is the
 *    ambiguous case: only its version history can tell. Those histories are
 *    read first, linked and decision pages before the rest. An ambiguous page
 *    whose history cannot be read within the call budget is LEFT OUT (with a
 *    warning) rather than reported as a sole-contributor page it may not be.
 *  - App accounts (automation, bots) are not people: they are dropped from
 *    the people list and from page contributors.
 *
 * UNVERIFIED against a live site until spike S1 (docs/SPIKES.md): the shapes
 * below follow Atlassian's published REST documentation. `onResponse` lets the
 * export CLI dump every raw payload so S1 can diff them against these types.
 */

/** Transport for one site. Paths are site-relative and already URL-encoded. */
export interface SiteRequester {
  /** GET a Jira path (starting with /rest/) and return the parsed JSON body. */
  jira(path: string): Promise<unknown>;
  /** GET a Confluence path (starting with /wiki/) and return the parsed JSON body. */
  confluence(path: string): Promise<unknown>;
}

/** A failed upstream call. Requesters throw it so the loader can degrade per source. */
export class SiteRequestError extends Error {
  readonly status: number;
  readonly path: string;
  /** Seconds from a Retry-After header, when the site sent one (429/503). */
  readonly retryAfterSeconds?: number;

  constructor(status: number, path: string, message?: string, retryAfterSeconds?: number) {
    super(message ?? `Request failed with status ${status}: ${path}`);
    this.name = 'SiteRequestError';
    this.status = status;
    this.path = path;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Parse a Retry-After header (delta-seconds only; HTTP dates are ignored). */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

export interface RetryOptions {
  /** Extra attempts after the first (default 2). */
  retries?: number;
  /** Longest wait honoured, in seconds (default 5): a site asking for longer is reported, not waited on. */
  maxWaitSeconds?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Wrap a requester so rate limiting (429) and brief unavailability (503) are
 * retried with Retry-After (or a short exponential backoff). Every other
 * failure passes straight through: the loader decides what it means.
 */
export function withRetry(requester: SiteRequester, options: RetryOptions = {}): SiteRequester {
  const retries = options.retries ?? 2;
  const maxWait = options.maxWaitSeconds ?? 5;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const attempt = async (call: () => Promise<unknown>): Promise<unknown> => {
    for (let i = 0; ; i++) {
      try {
        return await call();
      } catch (err) {
        const retryable = err instanceof SiteRequestError && (err.status === 429 || err.status === 503);
        if (!retryable || i >= retries) throw err;
        const wait = err.retryAfterSeconds ?? 0.5 * 2 ** i;
        if (wait > maxWait) throw err;
        await sleep(wait * 1000);
      }
    }
  };
  return {
    jira: (path) => attempt(() => requester.jira(path)),
    confluence: (path) => attempt(() => requester.confluence(path)),
  };
}

export interface SiteLoadLimits {
  /** Issues read through search (pages of 100). */
  maxIssues: number;
  /** Remote-link calls (one per issue): epics and their children first. */
  maxRemoteLinkCalls: number;
  /** Confluence pages read (pages of 250), most recently modified first. */
  maxPages: number;
  /** Version-history calls (one per page): ambiguous linked/decision pages first. */
  maxVersionCalls: number;
  /** Account ids looked up for display names (batches of 50). */
  maxUserLookups: number;
}

export const DEFAULT_SITE_LIMITS: SiteLoadLimits = {
  maxIssues: 500,
  maxRemoteLinkCalls: 80,
  maxPages: 500,
  maxVersionCalls: 120,
  maxUserLookups: 500,
};

/**
 * Bounded by design (the enhanced search rejects unbounded JQL): every issue
 * updated in the last two years. Type names are not used in the JQL because
 * they are localized and differ between company- and team-managed projects; a
 * missing name would fail the whole search. Types are read from the payload.
 */
export const DEFAULT_JQL = 'updated >= -730d ORDER BY updated DESC';

export interface SiteLoadOptions {
  /** e.g. https://your-site.atlassian.net — used only to build record links. Derived from Confluence when absent. */
  siteUrl?: string;
  /** A bounded JQL query (see DEFAULT_JQL). */
  jql?: string;
  limits?: Partial<SiteLoadLimits>;
  /** Parallel calls during the per-issue and per-page fan-outs. */
  concurrency?: number;
  /** Observe every raw response (the export CLI's --raw dump for spike S1). */
  onResponse?: (source: 'jira' | 'confluence', path: string, body: unknown) => void;
}

export interface SiteLoadReport {
  issues: number;
  pages: number;
  people: number;
  calls: { jira: number; confluence: number };
  /** Limits that cut the read short (honest: the graph is a window, not the whole site). */
  truncated: string[];
  /** Degradations: sources or records that could not be read, and why. */
  warnings: string[];
}

export interface SiteLoadResult {
  graph: OrgGraph;
  report: SiteLoadReport;
}

const JIRA_FIELDS = 'summary,status,assignee,issuetype,parent';
const SEARCH_PAGE_SIZE = 100;
const CONFLUENCE_PAGE_SIZE = 250;
const VERSIONS_PAGE_SIZE = 50;
const USER_BATCH = 50;
const KEY_BATCH = 50;

// ---------------------------------------------------------------- raw shapes

interface JiraSearchResponse {
  issues?: JiraIssueRaw[];
  nextPageToken?: string | null;
  isLast?: boolean;
}

interface ConfluencePageV2 {
  id?: string;
  title?: string;
  status?: string;
  authorId?: string;
  ownerId?: string;
  version?: { number?: number; authorId?: string };
  _links?: { webui?: string };
}

interface ConfluencePagesResponse {
  results?: ConfluencePageV2[];
  _links?: { next?: string; base?: string };
}

interface ConfluenceVersionsResponse {
  results?: { number?: number; authorId?: string }[];
}

interface JiraUserRaw {
  accountId?: string;
  displayName?: string;
  accountType?: string;
}

interface JiraUserBulkResponse {
  values?: JiraUserRaw[];
}

// ------------------------------------------------------------------- helpers

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function describe(err: unknown): string {
  if (err instanceof SiteRequestError) return `status ${err.status}`;
  return err instanceof Error ? err.message : String(err);
}

/** Run `fn` over `items` with at most `limit` calls in flight; results keep input order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Jira issue keys are PROJECT-123; anything else is refused before it reaches a JQL string. */
const ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,254}-\d{1,12}$/;

/** Confluence ids are numeric strings. */
const NUMERIC_ID = /^\d{1,20}$/;

/** Derive https://site.atlassian.net from Confluence's `_links.base` (https://site.atlassian.net/wiki). */
function siteUrlFromBase(base: unknown): string | undefined {
  if (typeof base !== 'string') return undefined;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

// -------------------------------------------------------------------- loader

/**
 * Read a site into an OrgGraph. Throws only when Jira search itself fails (no
 * graph is better than a silently empty one); every other source degrades to
 * a warning in the report.
 */
export async function loadSiteGraph(requester: SiteRequester, options: SiteLoadOptions = {}): Promise<SiteLoadResult> {
  const limits: SiteLoadLimits = { ...DEFAULT_SITE_LIMITS, ...options.limits };
  const concurrency = options.concurrency ?? 6;
  const report: SiteLoadReport = {
    issues: 0,
    pages: 0,
    people: 0,
    calls: { jira: 0, confluence: 0 },
    truncated: [],
    warnings: [],
  };

  const jira = async (path: string): Promise<unknown> => {
    report.calls.jira++;
    const body = await requester.jira(path);
    options.onResponse?.('jira', path, body);
    return body;
  };
  const confluence = async (path: string): Promise<unknown> => {
    report.calls.confluence++;
    const body = await requester.confluence(path);
    options.onResponse?.('confluence', path, body);
    return body;
  };

  // 1. Issues (fatal on failure), then the epics their children point at.
  const issues = await searchIssues(jira, options.jql ?? DEFAULT_JQL, limits.maxIssues, report);
  await addMissingEpics(jira, issues, report);

  // 2 + 3, in parallel (they are independent, and Forge resolvers have a short
  // time limit): Confluence pages (degrades: no Confluence, no scope, no pages)
  // and the per-issue remote links (degrade per issue).
  const [listed, remoteLinks] = await Promise.all([
    listPages(confluence, limits.maxPages, report),
    readRemoteLinks(jira, issues, limits.maxRemoteLinkCalls, concurrency, report),
  ]);
  const siteUrl = options.siteUrl ?? listed.siteUrl;

  // 4. Contributors from version history where the page record cannot settle it.
  const linkedPageIds = new Set<string>();
  for (const links of Object.values(remoteLinks)) {
    for (const link of links) {
      const id = pageIdFromRemoteLink(link, siteUrl);
      if (id) linkedPageIds.add(id);
    }
  }
  const pages = await resolveContributors(confluence, listed.pages, linkedPageIds, limits.maxVersionCalls, concurrency, report);

  // 5. Names for every account id, and which ids are app accounts.
  const accounts = await lookupAccounts(jira, issues, pages, limits.maxUserLookups, report);

  // 6. Assemble through the normalizers (the contract the engine already trusts).
  const isPerson = (id: string) => !accounts.appIds.has(id);
  const people = new Map<string, Person>();
  for (const issue of issues) {
    const assignee = issue.fields.assignee;
    if (assignee?.accountId && assignee.accountType !== 'app' && isPerson(assignee.accountId) && !people.has(assignee.accountId)) {
      people.set(assignee.accountId, {
        id: assignee.accountId,
        name: assignee.displayName ?? accounts.names.get(assignee.accountId) ?? assignee.accountId,
      });
    }
  }
  let unverifiable = 0;
  const pageInputs = pages.flatMap((p) => {
    const contributorIds = p.contributorIds.filter(isPerson);
    // Removing app accounts can leave one human on a page whose middle versions were never read:
    // that would be an unchecked sole-contributor claim, so the page is left out instead.
    if (contributorIds.length === 1 && contributorIds.length < p.contributorIds.length && !p.exact) {
      unverifiable++;
      return [];
    }
    for (const id of contributorIds) {
      if (!people.has(id)) people.set(id, { id, name: accounts.names.get(id) ?? id });
    }
    return [{ raw: p.raw, contributorIds }];
  });
  if (unverifiable > 0) {
    report.warnings.push(`pages: ${unverifiable} page(s) left out: with app accounts removed one person remains, and their full edit history was not read`);
  }

  const partial = buildOrgGraph({
    issues: issues.map((issue) =>
      issue.fields.assignee && (issue.fields.assignee.accountType === 'app' || accounts.appIds.has(issue.fields.assignee.accountId ?? ''))
        ? { ...issue, fields: { ...issue.fields, assignee: null } }
        : issue,
    ),
    remoteLinks,
    pages: pageInputs,
    people: [...people.values()].sort((a, b) => a.id.localeCompare(b.id)),
    siteUrl,
  });
  const decisions = deriveDecisions(partial.pages, partial.workItems);

  report.issues = partial.workItems.length;
  report.pages = partial.pages.length;
  report.people = partial.people.length;
  // Pull requests: no supported Bitbucket path yet (decision D2), so none are connected.
  return { graph: { ...partial, decisions }, report };
}

// ------------------------------------------------------------------- stages

async function searchIssues(
  jira: (path: string) => Promise<unknown>,
  jql: string,
  maxIssues: number,
  report: SiteLoadReport,
): Promise<JiraIssueRaw[]> {
  const byKey = new Map<string, JiraIssueRaw>();
  const seenTokens = new Set<string>();
  let token: string | undefined;

  for (;;) {
    const params = new URLSearchParams({
      jql,
      maxResults: String(Math.min(SEARCH_PAGE_SIZE, maxIssues - byKey.size)),
      fields: JIRA_FIELDS,
    });
    // Never send an empty or "null" token: the first request carries none (JRACLOUD-94632).
    if (token) params.set('nextPageToken', token);
    const body = await jira(`/rest/api/3/search/jql?${params.toString()}`);
    const page = (isObject(body) ? body : {}) as JiraSearchResponse;

    let added = 0;
    for (const issue of asArray<JiraIssueRaw>(page.issues)) {
      if (!issue || typeof issue.key !== 'string' || !isObject(issue.fields) || byKey.has(issue.key)) continue;
      byKey.set(issue.key, issue);
      added++;
      if (byKey.size >= maxIssues) break;
    }

    if (byKey.size >= maxIssues) {
      if (page.nextPageToken && page.isLast !== true) report.truncated.push(`issues: stopped at ${maxIssues}`);
      break;
    }
    const nextToken = typeof page.nextPageToken === 'string' && page.nextPageToken.length > 0 ? page.nextPageToken : undefined;
    if (!nextToken || page.isLast === true || added === 0) break;
    if (seenTokens.has(nextToken)) {
      report.warnings.push('issues: Jira returned a page token it had already returned; stopped paging to avoid a loop');
      break;
    }
    seenTokens.add(nextToken);
    token = nextToken;
  }
  return [...byKey.values()];
}

/**
 * Children updated recently may point at an epic that was not (an old epic
 * outside the JQL window). Fetch exactly those parents with a bounded
 * `key in (...)` query, so a child never loses its epic to the window.
 */
async function addMissingEpics(
  jira: (path: string) => Promise<unknown>,
  issues: JiraIssueRaw[],
  report: SiteLoadReport,
): Promise<void> {
  const have = new Set(issues.map((i) => i.key));
  const missing = new Set<string>();
  for (const issue of issues) {
    const parent = issue.fields.parent;
    if (!parent?.key || have.has(parent.key) || !ISSUE_KEY.test(parent.key)) continue;
    // Only epics matter for lineage; a parent of unknown type is fetched and typed from its own payload.
    const type = parent.fields?.issuetype;
    if (type && workItemType(type) !== 'epic') continue;
    missing.add(parent.key);
  }
  for (const keys of chunk([...missing].sort(), KEY_BATCH)) {
    const params = new URLSearchParams({
      jql: `key in (${keys.join(',')})`,
      maxResults: String(keys.length),
      fields: JIRA_FIELDS,
    });
    try {
      const body = await jira(`/rest/api/3/search/jql?${params.toString()}`);
      for (const issue of asArray<JiraIssueRaw>(isObject(body) ? body.issues : undefined)) {
        if (issue && typeof issue.key === 'string' && isObject(issue.fields) && !have.has(issue.key)) {
          issues.push(issue);
          have.add(issue.key);
        }
      }
    } catch (err) {
      report.warnings.push(`epics: ${keys.length} parent epic(s) outside the search window could not be read (${describe(err)})`);
    }
  }
}

async function listPages(
  confluence: (path: string) => Promise<unknown>,
  maxPages: number,
  report: SiteLoadReport,
): Promise<{ pages: ConfluencePageV2[]; siteUrl?: string }> {
  const pages: ConfluencePageV2[] = [];
  const seen = new Set<string>();
  const seenCursors = new Set<string>();
  let siteUrl: string | undefined;
  let path: string | undefined =
    `/wiki/api/v2/pages?${new URLSearchParams({ limit: String(CONFLUENCE_PAGE_SIZE), status: 'current', sort: '-modified-date' }).toString()}`;

  while (path) {
    let body: unknown;
    try {
      body = await confluence(path);
    } catch (err) {
      report.warnings.push(
        pages.length === 0
          ? `pages: Confluence pages could not be read (${describe(err)}); page and decision findings are off for this read`
          : `pages: paging stopped after ${pages.length} page(s) (${describe(err)})`,
      );
      break;
    }
    const response = (isObject(body) ? body : {}) as ConfluencePagesResponse;
    siteUrl ??= siteUrlFromBase(response._links?.base);
    for (const page of asArray<ConfluencePageV2>(response.results)) {
      if (!page || typeof page.id !== 'string' || !NUMERIC_ID.test(page.id) || typeof page.title !== 'string') continue;
      if (seen.has(page.id)) continue;
      seen.add(page.id);
      pages.push(page);
      if (pages.length >= maxPages) break;
    }
    const next = response._links?.next;
    if (pages.length >= maxPages) {
      if (next) report.truncated.push(`pages: stopped at ${maxPages}, most recently modified first`);
      break;
    }
    // Follow only a same-endpoint relative cursor link; anything else ends paging.
    if (typeof next !== 'string' || !next.startsWith('/wiki/api/v2/pages?') || seenCursors.has(next)) break;
    seenCursors.add(next);
    path = next;
  }
  return { pages, siteUrl };
}

async function readRemoteLinks(
  jira: (path: string) => Promise<unknown>,
  issues: JiraIssueRaw[],
  maxCalls: number,
  concurrency: number,
  report: SiteLoadReport,
): Promise<Record<string, JiraRemoteLinkRaw[]>> {
  const epicKeys = new Set(issues.filter((i) => workItemType(i.fields.issuetype) === 'epic').map((i) => i.key));
  // Epics first, then their children, then the rest: lineage reads epics and their work.
  const ranked = [
    ...issues.filter((i) => epicKeys.has(i.key)),
    ...issues.filter((i) => !epicKeys.has(i.key) && i.fields.parent?.key && epicKeys.has(i.fields.parent.key)),
    ...issues.filter((i) => !epicKeys.has(i.key) && !(i.fields.parent?.key && epicKeys.has(i.fields.parent.key))),
  ].filter((i) => ISSUE_KEY.test(i.key));
  const selected = ranked.slice(0, maxCalls);
  if (ranked.length > selected.length) {
    report.truncated.push(`remote links: read for ${selected.length} of ${ranked.length} issues (epics and their work first)`);
  }

  const links: Record<string, JiraRemoteLinkRaw[]> = {};
  let failed = 0;
  await mapLimit(selected, concurrency, async (issue) => {
    try {
      const body = await jira(`/rest/api/3/issue/${encodeURIComponent(issue.key)}/remotelink`);
      links[issue.key] = asArray<JiraRemoteLinkRaw>(body).filter(isObject);
    } catch {
      failed++;
    }
  });
  if (failed > 0) report.warnings.push(`remote links: ${failed} issue(s) could not be read; their page links are missing`);
  return links;
}

interface ResolvedPage {
  raw: ConfluencePageRaw;
  contributorIds: string[];
  /** True when the contributor set is complete: one version, or the whole history was read. */
  exact: boolean;
}

async function resolveContributors(
  confluence: (path: string) => Promise<unknown>,
  pages: ConfluencePageV2[],
  linkedPageIds: Set<string>,
  maxCalls: number,
  concurrency: number,
  report: SiteLoadReport,
): Promise<ResolvedPage[]> {
  const known = new Map<string, Set<string>>();
  const ambiguous: ConfluencePageV2[] = [];
  const incomplete: ConfluencePageV2[] = [];

  for (const page of pages) {
    const author = page.authorId;
    const lastEditor = page.version?.authorId;
    const versions = page.version?.number;
    const ids = new Set([author, lastEditor].filter((id): id is string => typeof id === 'string' && id.length > 0));
    known.set(page.id!, ids);
    if (ids.size === 0 || versions === 1) continue; // nothing recorded, or one version: exact
    if (ids.size === 1) ambiguous.push(page); // several versions (or unknown), one known editor
    else if (versions === undefined || versions > 2) incomplete.push(page); // >= 2 editors, middle versions unknown
  }

  // Linked and decision pages drive findings, so their histories are read first.
  const priority = (p: ConfluencePageV2) => (linkedPageIds.has(p.id!) || /^Decision:\s/.test(p.title ?? '') ? 0 : 1);
  const queue = [
    ...ambiguous.filter((p) => priority(p) === 0),
    ...ambiguous.filter((p) => priority(p) === 1),
    ...incomplete.filter((p) => priority(p) === 0),
    ...incomplete.filter((p) => priority(p) === 1),
  ];
  const selected = queue.slice(0, maxCalls);
  const complete = new Set<string>();

  await mapLimit(selected, concurrency, async (page) => {
    try {
      const body = await confluence(
        `/wiki/api/v2/pages/${encodeURIComponent(page.id!)}/versions?${new URLSearchParams({ limit: String(VERSIONS_PAGE_SIZE) }).toString()}`,
      );
      const ids = known.get(page.id!)!;
      const versions = asArray<{ authorId?: string }>(isObject(body) ? (body as ConfluenceVersionsResponse).results : undefined);
      for (const version of versions) {
        if (version && typeof version.authorId === 'string' && version.authorId.length > 0) ids.add(version.authorId);
      }
      // One call reads the newest VERSIONS_PAGE_SIZE versions: complete only when that covers them all.
      const total = page.version?.number;
      if (total !== undefined ? total <= VERSIONS_PAGE_SIZE : versions.length < VERSIONS_PAGE_SIZE) complete.add(page.id!);
    } catch {
      // A failed history read leaves the page incomplete; the rules below decide what that means.
    }
  });

  // An ambiguous page whose history was not read cannot be honestly reported either way: leave it out.
  const readIds = new Set(selected.map((p) => p.id!));
  const dropped = new Set<string>();
  for (const page of ambiguous) {
    const ids = known.get(page.id!)!;
    // Still one editor and the history is not known in full: a sole-contributor claim cannot be checked.
    if (ids.size <= 1 && !complete.has(page.id!)) dropped.add(page.id!);
  }
  if (dropped.size > 0) {
    report.warnings.push(
      `pages: ${dropped.size} page(s) left out because their edit history could not be read in full (budget ${maxCalls} calls, or a failed call), so a sole-contributor claim could not be checked`,
    );
  }
  const skippedIncomplete = incomplete.filter((p) => !readIds.has(p.id!)).length;
  if (skippedIncomplete > 0) {
    report.truncated.push(`pages: ${skippedIncomplete} page(s) list only their author and last editor (history not read; never a sole-contributor claim)`);
  }

  return pages
    .filter((p) => !dropped.has(p.id!))
    .map((p) => ({
      raw: { id: p.id!, title: p.title!, _links: p._links?.webui ? { webui: p._links.webui } : undefined },
      contributorIds: [...(known.get(p.id!) ?? [])].sort(),
      exact: p.version?.number === 1 || complete.has(p.id!),
    }));
}

async function lookupAccounts(
  jira: (path: string) => Promise<unknown>,
  issues: JiraIssueRaw[],
  pages: ResolvedPage[],
  maxLookups: number,
  report: SiteLoadReport,
): Promise<{ names: Map<string, string>; appIds: Set<string> }> {
  const names = new Map<string, string>();
  const appIds = new Set<string>();
  for (const issue of issues) {
    const a = issue.fields.assignee;
    if (a?.accountId && a.displayName) names.set(a.accountId, a.displayName);
    if (a?.accountId && a.accountType === 'app') appIds.add(a.accountId);
  }
  const unnamed = new Set<string>();
  for (const page of pages) {
    for (const id of page.contributorIds) if (!names.has(id)) unnamed.add(id);
  }
  const ids = [...unnamed].sort();
  const selected = ids.slice(0, maxLookups);
  if (ids.length > selected.length) {
    report.truncated.push(`people: names looked up for ${selected.length} of ${ids.length} accounts; the rest show their account id`);
  }

  for (const batch of chunk(selected, USER_BATCH)) {
    const params = new URLSearchParams({ maxResults: String(batch.length) });
    for (const id of batch) params.append('accountId', id);
    try {
      const body = await jira(`/rest/api/3/user/bulk?${params.toString()}`);
      for (const user of asArray<JiraUserRaw>(isObject(body) ? (body as JiraUserBulkResponse).values : undefined)) {
        if (!user || typeof user.accountId !== 'string') continue;
        if (typeof user.displayName === 'string' && user.displayName.length > 0) names.set(user.accountId, user.displayName);
        if (user.accountType === 'app') appIds.add(user.accountId);
      }
    } catch (err) {
      report.warnings.push(`people: ${batch.length} display name(s) could not be read (${describe(err)}); those people show their account id`);
    }
  }
  if (appIds.size > 0) {
    report.warnings.push(`people: ${appIds.size} app account(s) (automation, bots) left out of people and page contributors`);
  }
  return { names, appIds };
}
