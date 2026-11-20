import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TRACEFLOW_TOOLS, createTokenRequester, loadSiteGraph, runTool, runPipeline, sampleGraph } from '@traceflow/core';
import type { DataAdapter, OrgGraph, TokenSiteOptions } from '@traceflow/core';

/**
 * The MCP surface of TraceFlow: the same engine and the same DataAdapter contract
 * the Workbench UI uses, exposed as tools for any MCP-capable agent.
 *
 * Truth rules (they apply to every tool):
 *  - findings come from records, never from a model;
 *  - every result carries evidence records (source, id, title, url when known);
 *  - a missing link means "not found in the connected data", never "does not exist".
 *
 * Entity resolution uses the shared fuzzy matchers from @traceflow/core
 * (matcher.ts): the same typo-tolerant, ambiguity-aware matching that powers
 * the natural-language answer layer, so `person: "Alexs Rivera"` works the
 * same way whether an agent or a human typed it.
 */

/** Any DataAdapter can feed the server: the sample fixtures, a graph export, a Forge resolver. */
export type GraphSource = Pick<DataAdapter, 'name' | 'loadGraph'> & {
  /** True when loadGraph may return a newer graph over time (a live site); it is then asked on every call. */
  refreshes?: boolean;
};

/**
 * Wrap any graph source in the validation pipeline (best-effort): broken records
 * are quarantined, dangling references dropped, and every warning is logged once
 * to stderr (the log channel for stdio MCP). A hostile or partially-broken source
 * can serve degraded-but-honest data instead of crashing every tool call.
 *
 * A static source (the fixtures, an export, an adapter) is loaded and
 * validated once. A refreshing source (`refreshes: true`, a live site) is
 * asked on every call and re-validated exactly when it returns a new graph
 * object. A failed load is never cached; the next call retries the source.
 */
export function validatedSource(source: GraphSource, log: (line: string) => void = console.error): GraphSource {
  const sanitize = (raw: OrgGraph): OrgGraph => {
    const result = runPipeline(raw, { mode: 'best-effort', context: `source '${source.name}'` });
    for (const warning of result.warnings) {
      log(`traceflow-mcp: warning: ${warning.path}: ${warning.message}`);
    }
    for (const rejected of result.rejected) {
      log(`traceflow-mcp: quarantined ${rejected.path}: ${rejected.reason}`);
    }
    return result.graph;
  };

  if (source.refreshes) {
    const sanitized = new WeakMap<OrgGraph, OrgGraph>();
    return {
      name: source.name,
      refreshes: true,
      loadGraph: async () => {
        const raw = await source.loadGraph();
        let graph = sanitized.get(raw);
        if (!graph) {
          graph = sanitize(raw);
          sanitized.set(raw, graph);
        }
        return graph;
      },
    };
  }

  let cached: Promise<OrgGraph> | undefined;
  return {
    name: source.name,
    loadGraph: async () => {
      if (!cached) {
        cached = (async () => sanitize(await source.loadGraph()))();
        cached.catch(() => {
          // Do not cache a failed load; the next call retries the source.
          cached = undefined;
        });
      }
      return cached;
    },
  };
}

/**
 * A live Atlassian site read through the shared loader with an API token
 * (ATLASSIAN_SITE_URL / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN). The graph is
 * re-read after `ttlSeconds` so a long-running server does not serve a stale
 * site forever; a failed read is not cached (the next call retries).
 */
export function liveSiteSource(
  options: TokenSiteOptions & { ttlSeconds?: number; log?: (line: string) => void },
): GraphSource {
  const requester = createTokenRequester(options);
  const ttlMs = (options.ttlSeconds ?? 300) * 1000;
  const log = options.log ?? console.error;
  let cache: { at: number; graph: Promise<OrgGraph> } | undefined;
  return {
    name: `site:${new URL(options.siteUrl).host}`,
    refreshes: true,
    loadGraph: async () => {
      if (!cache || Date.now() - cache.at > ttlMs) {
        const graph = loadSiteGraph(requester, { siteUrl: options.siteUrl }).then(({ graph, report }) => {
          log(
            `traceflow-mcp: read ${report.issues} issues, ${report.pages} pages, ${report.people} people from ${options.siteUrl}`,
          );
          for (const line of [...report.truncated, ...report.warnings]) log(`traceflow-mcp: ${line}`);
          return graph;
        });
        const entry = { at: Date.now(), graph };
        cache = entry;
        graph.catch(() => {
          if (cache === entry) cache = undefined;
        });
      }
      return cache.graph;
    },
  };
}

export const SAMPLE_SOURCE: GraphSource = {
  name: 'sample',
  loadGraph: async () => sampleGraph,
};

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** Build the TraceFlow MCP server over a graph source (validated through the pipeline). */
export function createTraceflowServer(source: GraphSource = SAMPLE_SOURCE): McpServer {
  const server = new McpServer(
    { name: 'traceflow', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  // One validated wrapper per server: the pipeline runs once per source load
  // and the sanitized graph is shared by every tool.
  const validated = validatedSource(source);
  const load = () => validated.loadGraph();

  // Every tool comes from the shared catalog (@traceflow/core tools.ts), the same
  // definitions the Forge app serves as Rovo actions and rovo:mcp tools.
  for (const tool of TRACEFLOW_TOOLS) {
    const description =
      tool.name === 'traceflow_list_people' ? `${tool.description} Data source: ${source.name}.` : tool.description;
    const inputSchema = tool.input
      ? { [tool.input.name]: z.string().min(1).describe(tool.input.description) }
      : {};
    server.registerTool(tool.name, { title: tool.title, description, inputSchema }, async (args: Record<string, unknown>) => {
      const graph = await load();
      const outcome = runTool(tool, graph, tool.input ? args[tool.input.name] : undefined);
      return outcome.ok ? text(outcome.result) : fail(outcome.error);
    });
  }

  return server;
}
