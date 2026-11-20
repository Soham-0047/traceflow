import { asUser, assumeTrustedRoute } from '@forge/api';
import type { APIResponse, Route } from '@forge/api';
import { SiteRequestError, loadSiteGraph, parseRetryAfter, withRetry } from '@traceflow/core';
import type { OrgGraph, SiteLoadReport, SiteRequester } from '@traceflow/core';

/*
 * The Forge transport for the shared site loader (packages/core site-loader.ts,
 * where the endpoints, paging and coverage rules live and are tested).
 *
 * Reads run AS THE USER (`asUser()`): Jira and Confluence enforce that user's
 * permissions, so the Workbench and the agent never show a record the person
 * could not open themselves. The KVS cache is keyed per account for the same
 * reason (site-graph.ts): one person's view is never served to another.
 *
 * Paths reach this file already URL-encoded by the loader (every dynamic part
 * goes through encodeURIComponent or URLSearchParams, and the loader refuses
 * ids that are not issue keys or numeric page ids), which is why
 * `assumeTrustedRoute` is safe here.
 *
 * UNVERIFIED against the Forge runtime until spike S1 (docs/SPIKES.md).
 */

type ProductFetch = (route: Route, init?: { headers?: Record<string, string> }) => Promise<APIResponse>;

async function getJson(fetchProduct: ProductFetch, path: string): Promise<unknown> {
  const response = await fetchProduct(assumeTrustedRoute(path), { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new SiteRequestError(
      response.status,
      path,
      `Upstream request failed: ${response.status} ${response.statusText}`,
      parseRetryAfter(response.headers.get('Retry-After')),
    );
  }
  return response.json();
}

/** The site requester for the current invocation's user. */
export function forgeRequester(): SiteRequester {
  const user = asUser();
  return withRetry({
    jira: (path) => getJson((route, init) => user.requestJira(route, init), path),
    confluence: (path) => getJson((route, init) => user.requestConfluence(route, init), path),
  });
}

/** Log the read's limits and degradations once, so the Forge logs explain a thin graph. */
export function logReport(report: SiteLoadReport, log: (line: string) => void = console.warn): void {
  log(
    `traceflow: read ${report.issues} issues, ${report.pages} pages, ${report.people} people ` +
      `(${report.calls.jira} Jira + ${report.calls.confluence} Confluence calls)`,
  );
  for (const line of report.truncated) log(`traceflow: limit: ${line}`);
  for (const line of report.warnings) log(`traceflow: warning: ${line}`);
}

/** Build the OrgGraph for the current site and user. The caller caches it (site-graph.ts). */
export async function loadOrgGraphFromSite(siteUrl?: string): Promise<OrgGraph> {
  const { graph, report } = await loadSiteGraph(forgeRequester(), siteUrl ? { siteUrl } : {});
  logReport(report);
  return graph;
}
