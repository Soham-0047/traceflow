import { invoke } from '@forge/bridge';
import type { DataAdapter, OrgGraph } from '@traceflow/core';

function isOrgGraph(value: unknown): value is OrgGraph {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as OrgGraph).people) &&
    Array.isArray((value as OrgGraph).workItems) &&
    Array.isArray((value as OrgGraph).pages) &&
    Array.isArray((value as OrgGraph).decisions)
  );
}

/**
 * The Forge DataAdapter: the same interface the demo's mock adapter implements,
 * backed by the `getGraph` resolver instead of fixtures. The Workbench never
 * fetches Atlassian data directly (TF-03 contract).
 *
 * `invoke` returns the payload directly or wrapped as `{ body, metadata }`
 * depending on the invocation mode; both are unwrapped and validated.
 */
export function createForgeAdapter(): DataAdapter {
  return {
    name: 'forge',
    loadGraph: async () => {
      const result: unknown = await invoke('getGraph');
      const candidate =
        typeof result === 'object' && result !== null && 'body' in result
          ? (result as { body: unknown }).body
          : result;
      if (!isOrgGraph(candidate)) {
        throw new Error('The resolver returned an unexpected response. Nothing was changed.');
      }
      return candidate;
    },
  };
}
