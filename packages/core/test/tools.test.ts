import { describe, expect, it } from 'vitest';
import { MAX_TOOL_ARGUMENT_LENGTH, TRACEFLOW_TOOLS, findTool, runTool, sampleGraph } from '../src/index.js';

const SAMPLE_ARGS: Record<string, string> = {
  question: 'What breaks if Alex leaves?',
  person: 'alex',
  epic: 'PAY-1',
  decision: 'd3',
};

describe('the tool catalog', () => {
  it('keeps every identifier unique and inside the Forge limits', () => {
    const unique = (values: string[]) => new Set(values).size === values.length;
    expect(unique(TRACEFLOW_TOOLS.map((t) => t.name))).toBe(true);
    expect(unique(TRACEFLOW_TOOLS.map((t) => t.actionKey))).toBe(true);
    expect(unique(TRACEFLOW_TOOLS.map((t) => t.functionKey))).toBe(true);
    expect(unique(TRACEFLOW_TOOLS.map((t) => t.handler))).toBe(true);
    // rovo:mcp exposes at most 50 tools; action keys are under 64 characters; function keys
    // are capped at 23 characters and action descriptions at 255 (Atlassian's manifest validator).
    expect(TRACEFLOW_TOOLS.length).toBeLessThanOrEqual(50);
    for (const tool of TRACEFLOW_TOOLS) {
      expect(tool.actionKey).toMatch(/^[a-zA-Z0-9_-]{1,63}$/);
      expect(tool.functionKey).toMatch(/^[a-zA-Z0-9_-]{1,23}$/);
      expect(tool.summary.length).toBeLessThanOrEqual(255);
      expect(tool.summary).toMatch(/Read-only\./);
      expect(tool.description).toMatch(/evidence/);
    }
  });

  it('keeps the MCP tool names the clients already use', () => {
    expect(TRACEFLOW_TOOLS.map((t) => t.name)).toEqual([
      'traceflow_list_people',
      'traceflow_person_risk',
      'traceflow_person_impact',
      'traceflow_epic_lineage',
      'traceflow_decision_trace',
      'traceflow_epic_impact',
      'traceflow_decision_impact',
      'traceflow_overview',
      'traceflow_query',
    ]);
    expect(findTool('traceflow-investigate')?.name).toBe('traceflow_query');
    expect(findTool('traceflow_overview')?.actionKey).toBe('traceflow-overview');
    expect(findTool('nope')).toBeUndefined();
  });

  it('runs every tool on the sample graph and returns evidence-bearing results', () => {
    for (const tool of TRACEFLOW_TOOLS) {
      const outcome = runTool(tool, sampleGraph, tool.input ? SAMPLE_ARGS[tool.input.name] : undefined);
      expect(outcome.ok, `${tool.name}: ${outcome.ok ? '' : outcome.error}`).toBe(true);
      expect(JSON.stringify(outcome.ok ? outcome.result : null)).toMatch(/"source":"(jira|confluence|bitbucket)"|"people":\[/);
    }
  });

  it('refuses missing, non-string and oversized arguments instead of guessing', () => {
    const risk = findTool('traceflow_person_risk')!;
    expect(runTool(risk, sampleGraph)).toEqual({ ok: false, error: expect.stringMatching(/"person" input is required/) });
    expect(runTool(risk, sampleGraph, 42)).toMatchObject({ ok: false });
    expect(runTool(risk, sampleGraph, '   ')).toMatchObject({ ok: false });
    expect(runTool(risk, sampleGraph, 'a'.repeat(MAX_TOOL_ARGUMENT_LENGTH + 1))).toEqual({
      ok: false,
      error: expect.stringMatching(/too long/),
    });
  });

  it('reports an unknown entity as a relayable error, never a throw', () => {
    const outcome = runTool(findTool('traceflow_epic_impact')!, sampleGraph, 'the zeppelin programme');
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.error).toMatch(/epic/i);
  });

  it('answers questions through the deterministic answer layer', () => {
    const outcome = runTool(findTool('traceflow-investigate')!, sampleGraph, 'What breaks if Alex leaves?');
    expect(outcome).toMatchObject({ ok: true, result: { intent: 'person-impact', understood: true } });
  });
});
