import Resolver from '@forge/resolver';
import type { OrgGraph } from '@traceflow/core';
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
  return cached(kvStore, 'org-graph', GRAPH_TTL_SECONDS, () => loadOrgGraphFromSite(siteUrl));
});

export const handler = resolver.getDefinitions();
