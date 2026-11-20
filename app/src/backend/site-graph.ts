import type { OrgGraph } from '@traceflow/core';
import { runPipeline } from '@traceflow/core';
import { cached } from './cache';
import { loadOrgGraphFromSite } from './graph';
import { kvStore } from './kvs';

/**
 * $0 guardrail (docs/PLAN.md §11): the graph is cached in KVS for a short TTL so
 * repeat visits do not re-fan-out to Jira and Confluence. Shared by the Workbench
 * resolver and every Rovo action, so one cached read serves every surface.
 */
const GRAPH_TTL_SECONDS = 300;

/** KVS keys allow letters, digits and `:._-#` and spaces; anything else becomes `_`. */
export function graphCacheKey(accountId: string): string {
  return `org-graph:${accountId.replace(/[^a-zA-Z0-9:._#-]/g, '_').slice(0, 200)}`;
}

/**
 * The one way every app-side surface reads the site: a per-user cached fetch,
 * then the same validation pipeline every other source crosses.
 *
 * Reads run as the user (graph.ts), so the cache is keyed by account: a graph
 * built with one person's permissions is never served to another. Without an
 * account id (an invocation with no user) nothing is cached at all.
 *
 * A partially-failed REST fan-out leaves dangling references, and the
 * best-effort pipeline drops them with warnings instead of letting one bad
 * record break a view. Normalizers already produce well-formed records, so in
 * the happy path this is a cheap copy.
 *
 * UNVERIFIED against the Forge runtime until the first deploy (app/README.md).
 */
export async function loadSanitizedSiteGraph(siteUrl?: string, accountId?: string): Promise<OrgGraph> {
  const load = () => loadOrgGraphFromSite(siteUrl);
  const raw = accountId ? await cached(kvStore, graphCacheKey(accountId), GRAPH_TTL_SECONDS, load) : await load();
  const result = runPipeline(raw, { mode: 'best-effort', context: 'forge site graph' });
  for (const warning of result.warnings) {
    console.warn(`traceflow: ${warning.path}: ${warning.message}`);
  }
  return result.graph;
}
