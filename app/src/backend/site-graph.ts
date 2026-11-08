import type { OrgGraph } from '@traceflow/core';
import { runPipeline } from '@traceflow/core';
import { cached } from './cache';
import { loadOrgGraphFromSite } from './graph';
import { kvStore } from './kvs';

/**
 * $0 guardrail (docs/PLAN.md §11): the graph is cached in KVS for a short TTL so
 * repeat visits do not re-fan-out to Jira and Confluence. Shared by the Workbench
 * resolver and the Rovo agent action, so one cached read serves every surface.
 */
const GRAPH_TTL_SECONDS = 300;

/**
 * The one way every app-side surface reads the site: cached fetch, then the
 * same validation pipeline every other source crosses. A partially-failed
 * REST fan-out (a page whose contributors could not be read, an issue whose
 * remote links timed out) leaves dangling references, and the best-effort
 * pipeline drops them with warnings instead of letting one bad record break
 * a view. Normalizers already produce well-formed records, so in the happy
 * path this is a cheap copy.
 *
 * UNVERIFIED against the Forge runtime until the first deploy (app/README.md).
 */
export async function loadSanitizedSiteGraph(siteUrl?: string): Promise<OrgGraph> {
  const raw = await cached(kvStore, 'org-graph', GRAPH_TTL_SECONDS, () => loadOrgGraphFromSite(siteUrl));
  const result = runPipeline(raw, { mode: 'best-effort', context: 'forge site graph' });
  for (const warning of result.warnings) {
    console.warn(`traceflow: ${warning.path}: ${warning.message}`);
  }
  return result.graph;
}
