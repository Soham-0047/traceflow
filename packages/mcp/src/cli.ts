#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { OrgGraph } from '@traceflow/core';
import { createTraceflowServer, SAMPLE_SOURCE } from './server.js';
import type { GraphSource } from './server.js';

/**
 * The standalone TraceFlow MCP server (stdio).
 *
 * Graph source, in order of preference:
 *  1. TRACEFLOW_GRAPH=/path/to/graph.json — an OrgGraph export (see @traceflow/core types)
 *  2. the sample fixtures, so the server is useful out of the box for evaluation.
 *
 * A Forge-hosted source (rovo:mcp) replaces this file inside the Atlassian app;
 * the tools and the engine stay identical.
 */

function sourceFromEnv(): GraphSource {
  const path = process.env.TRACEFLOW_GRAPH;
  if (!path) return SAMPLE_SOURCE;
  let graph: OrgGraph;
  try {
    graph = JSON.parse(readFileSync(path, 'utf8')) as OrgGraph;
  } catch (err) {
    console.error(`traceflow-mcp: cannot read TRACEFLOW_GRAPH (${path}):`, err);
    process.exit(1);
  }
  return { name: `export:${path}`, loadGraph: async () => graph };
}

async function main(): Promise<void> {
  const server = createTraceflowServer(sourceFromEnv());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('traceflow-mcp: serving tools over stdio');
}

main().catch((err) => {
  console.error('traceflow-mcp: fatal:', err);
  process.exit(1);
});
