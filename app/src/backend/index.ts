import Resolver from '@forge/resolver';
import type { OrgGraph } from '@traceflow/core';
import { loadSanitizedSiteGraph } from './site-graph';

/**
 * The Workbench resolver. Every read goes through the shared site-graph
 * loader: one KVS-cached fetch, one best-effort pipeline pass (see
 * site-graph.ts), the same boundary every other surface crosses.
 */
const resolver = new Resolver();

resolver.define('getGraph', async (request): Promise<OrgGraph> => {
  // The product context may carry the site url (used only to build record links).
  const siteUrl = typeof request.context?.siteUrl === 'string' ? request.context.siteUrl : undefined;
  return loadSanitizedSiteGraph(siteUrl);
});

export const handler = resolver.getDefinitions();
