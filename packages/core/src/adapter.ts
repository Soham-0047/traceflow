import type { OrgGraph } from './types.js';

/**
 * Anything that can produce an OrgGraph. The UI and engines only depend on this:
 *  - `mock`  : fixtures (demo site, tests)
 *  - `forge` : Jira/Confluence (and later Bitbucket / Teamwork Graph) via Forge resolvers
 */
export interface DataAdapter {
  name: string;
  loadGraph(): Promise<OrgGraph>;
}

export function createStaticAdapter(name: string, graph: OrgGraph): DataAdapter {
  return { name, loadGraph: async () => graph };
}
