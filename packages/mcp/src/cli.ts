#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { runPipelineOnJson } from '@traceflow/core';
import { createTraceflowServer, SAMPLE_SOURCE } from './server.js';
import type { GraphSource } from './server.js';

/**
 * The standalone TraceFlow MCP server (stdio).
 *
 * Graph source, in order of preference:
 *  1. TRACEFLOW_GRAPH=/path/to/graph.json — an OrgGraph export (see @traceflow/core
 *     types). The file is parsed through the validation pipeline: a corrupt
 *     export fails fast with every issue listed, instead of serving a broken
 *     graph to every tool call.
 *  2. the sample fixtures, so the server is useful out of the box for evaluation.
 *
 * A Forge-hosted source (rovo:mcp) replaces this file inside the Atlassian app;
 * the tools and the engine stay identical.
 */

function sourceFromEnv(): GraphSource {
  const path = process.env.TRACEFLOW_GRAPH;
  if (!path) return SAMPLE_SOURCE;

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    console.error(`traceflow-mcp: cannot read TRACEFLOW_GRAPH (${path}):`, err);
    process.exit(1);
  }

  try {
    const { graph, warnings } = runPipelineOnJson(text, { context: path });
    for (const warning of warnings) {
      console.error(`traceflow-mcp: warning: ${warning.path}: ${warning.message}`);
    }
    return { name: `export:${path}`, loadGraph: async () => graph };
  } catch (err) {
    console.error(`traceflow-mcp: TRACEFLOW_GRAPH (${path}) is not a valid OrgGraph export:\n${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
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
