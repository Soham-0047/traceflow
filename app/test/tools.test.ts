import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

// The default exports wire themselves to the site-graph loader; mock it so
// every handler can run end to end without Forge.
vi.mock('../src/backend/site-graph', () => ({
  loadSanitizedSiteGraph: async () => (await import('@traceflow/core')).sampleGraph,
}));

import { TRACEFLOW_TOOLS, findTool, runTool, sampleGraph } from '@traceflow/core';
import * as handlers from '../src/backend/tools';
import { createToolAction } from '../src/backend/tools';

const here = fileURLToPath(new URL('.', import.meta.url));
const SAMPLE: Record<string, string> = { question: 'What breaks if Alex leaves?', person: 'alex', epic: 'PAY-1', decision: 'd3' };

describe('the Rovo tool actions', () => {
  it('exports one handler per catalog tool, and the manifest points at each', () => {
    const manifest = parse(readFileSync(join(here, '..', 'manifest.yml'), 'utf8'));
    const functions = new Map(manifest.modules.function.map((f: { key: string; handler: string }) => [f.key, f.handler]));
    for (const tool of TRACEFLOW_TOOLS) {
      expect(typeof (handlers as Record<string, unknown>)[tool.handler], tool.handler).toBe('function');
      expect(functions.get(tool.functionKey)).toBe(`backend/tools.${tool.handler}`);
    }
    expect(manifest.modules['rovo:mcp'][0].tools).toEqual(TRACEFLOW_TOOLS.map((t) => t.actionKey));
  });

  it('serves the same result as the shared catalog (and so as the MCP server)', async () => {
    for (const tool of TRACEFLOW_TOOLS) {
      const handler = (handlers as unknown as Record<string, (p: Record<string, unknown>) => Promise<unknown>>)[tool.handler]!;
      const payload = tool.input ? { [tool.input.name]: SAMPLE[tool.input.name] } : {};
      const expected = runTool(tool, sampleGraph, tool.input ? SAMPLE[tool.input.name] : undefined);
      expect(expected.ok).toBe(true);
      expect(await handler(payload)).toEqual(expected.ok ? expected.result : null);
    }
  });

  it('checks the model-extracted input before reading the site', async () => {
    const loadGraph = vi.fn(async () => sampleGraph);
    const action = createToolAction(findTool('traceflow_person_impact')!, { loadGraph });
    for (const bad of [{}, { person: 7 }, { person: '  ' }, { person: 'x'.repeat(501) }]) {
      expect(await action(bad)).toMatchObject({ ok: false, tool: 'traceflow-person-impact' });
    }
    expect(loadGraph).not.toHaveBeenCalled();
  });

  it('reads as the invoking user and relays engine refusals and read failures honestly', async () => {
    const accounts: (string | undefined)[] = [];
    const action = createToolAction(findTool('traceflow_epic_lineage')!, {
      loadGraph: async (_siteUrl, accountId) => {
        accounts.push(accountId);
        return sampleGraph;
      },
    });
    expect(await action({ epic: 'the zeppelin programme' }, { principal: { accountId: 'acc-9' } })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/epic/i),
    });
    expect(accounts).toEqual(['acc-9']);

    const logError = vi.fn();
    const broken = createToolAction(findTool('traceflow_overview')!, {
      loadGraph: () => Promise.reject(new Error('rate limited')),
      logError,
    });
    expect(await broken({})).toEqual({
      ok: false,
      tool: 'traceflow-overview',
      error: 'The connected records could not be read just now. Try again in a moment.',
    });
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
