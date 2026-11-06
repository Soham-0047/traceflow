import { createStaticAdapter, sampleGraph } from '@traceflow/core';
import type { DataAdapter, OrgGraph } from '@traceflow/core';

const emptyGraph: OrgGraph = { people: [], workItems: [], pages: [], pullRequests: [], decisions: [] };

/**
 * The demo adapter. `?demo=loading|empty|error` forces a state so every region's
 * four states can be seen without breaking anything.
 */
export function createDemoAdapter(search: string, delayMs = 300): DataAdapter {
  const mode = new URLSearchParams(search).get('demo');
  if (mode === 'loading') {
    return { name: 'demo-loading', loadGraph: () => new Promise<OrgGraph>(() => {}) };
  }
  if (mode === 'error') {
    return { name: 'demo-error', loadGraph: () => Promise.reject(new Error('The sample data request failed.')) };
  }
  const base = createStaticAdapter('sample', mode === 'empty' ? emptyGraph : sampleGraph);
  return {
    name: base.name,
    loadGraph: () => new Promise<OrgGraph>((resolve) => setTimeout(() => resolve(base.loadGraph()), delayMs)),
  };
}
