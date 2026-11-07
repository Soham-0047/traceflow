import Resolver from '@forge/resolver';
import type { OrgGraph } from '@traceflow/core';
import { runPipeline } from '@traceflow/core';
import { cached } from './cache';
import { loadOrgGraphFromSite } from './graph';
import { kvStore } from './kvs';

/**
 * $0 guardrail (docs/PLAN.md §11): the graph is cached in KVS for a short TTL so
 * repeat visits do not re-fan-out to Jira and Confluence.
 */
const GRAPH_TTL_SECONDS = 300;

const resolver = new Resolver();

resolver.define('getGraph', async (request): Promise<OrgGraph> => {
  // The product context may carry the site url (used only to build record links).
  const siteUrl = typeof request.context?.siteUrl === 'string' ? request.context.siteUrl : undefined;
  const graph = await cached(kvStore, 'org-graph', GRAPH_TTL_SECONDS, () => loadOrgGraphFromSite(siteUrl));
  /*
   * The site-built graph crosses the same pipeline boundary as every other
   * source: a partially-failed REST fan-out (a page whose contributors could
   * not be read, an issue whose remote links timed out) leaves dangling
   * references, and the best-effort pipeline drops them with warnings instead
   * of letting one bad record break a view. Normalizers already produce
   * well-formed records, so in the happy path this is a cheap copy.
   */
  const result = runPipeline(graph, { mode: 'best-effort', context: 'forge site graph' });
  for (const warning of result.warnings) {
    console.warn(`traceflow: ${warning.path}: ${warning.message}`);
  }
  return result.graph;
});

export const handler = resolver.getDefinitions();
