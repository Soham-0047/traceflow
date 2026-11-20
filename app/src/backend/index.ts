import Resolver from '@forge/resolver';
import type { OrgGraph } from '@traceflow/core';
import { loadSanitizedSiteGraph } from './site-graph';

/**
 * The Workbench resolver. Every read goes through the shared site-graph
 * loader: one per-user KVS-cached fetch (run as the user, so their Jira and
 * Confluence permissions apply), one best-effort pipeline pass (see
 * site-graph.ts), the same boundary every other surface crosses.
 */
const resolver = new Resolver();

resolver.define('getGraph', async (request): Promise<OrgGraph> => {
  // The product context carries the site url (used only to build record links)
  // and the viewing user's account id (the cache key).
  const siteUrl = typeof request.context?.siteUrl === 'string' ? request.context.siteUrl : undefined;
  const accountId = typeof request.context?.accountId === 'string' ? request.context.accountId : undefined;
  return loadSanitizedSiteGraph(siteUrl, accountId);
});

export const handler = resolver.getDefinitions();
