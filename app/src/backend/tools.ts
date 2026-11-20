import { TRACEFLOW_TOOLS, checkToolArgument, runTool } from '@traceflow/core';
import type { OrgGraph, ToolSpec } from '@traceflow/core';
import { accountIdOf, siteUrlFromPayload } from './agent';
import type { RovoActionContext, RovoActionPayload } from './agent';
import { loadSanitizedSiteGraph } from './site-graph';

/*
 * TF-04 + TF-06 inside Forge: every TraceFlow tool as a Rovo action. The
 * actions serve the Rovo agent (`rovo:agent`) and, through the `rovo:mcp`
 * module, external MCP clients on Atlassian's MCP infrastructure. Definitions
 * come from the shared catalog (@traceflow/core tools.ts), the same one the
 * standalone MCP server registers, so both hosts expose identical tools.
 *
 * Each handler: check the model-extracted input BEFORE touching the site,
 * read the site as the invoking user (per-user cache), run the tool, and
 * return either the engine's result or an honest error the agent relays.
 *
 * UNVERIFIED against the Rovo runtime until spike S3 (docs/SPIKES.md).
 */

export interface ToolActionDeps {
  loadGraph: (siteUrl?: string, accountId?: string) => Promise<OrgGraph>;
  logError?: (message: string, err: unknown) => void;
}

/** The failure payload: a plain message the agent can relay, never a guessed answer. */
export interface ToolActionError {
  ok: false;
  tool: string;
  error: string;
}

export function createToolAction(tool: ToolSpec, deps: ToolActionDeps) {
  return async function toolAction(payload: RovoActionPayload, context?: RovoActionContext): Promise<unknown> {
    const checked = checkToolArgument(tool, tool.input ? payload?.[tool.input.name] : undefined);
    if (!checked.ok) return { ok: false, tool: tool.actionKey, error: checked.error } satisfies ToolActionError;

    let graph: OrgGraph;
    try {
      graph = await deps.loadGraph(siteUrlFromPayload(payload), accountIdOf(payload, context));
    } catch (err) {
      (deps.logError ?? ((m, e) => console.error(m, e)))(`traceflow ${tool.actionKey}: could not load the site graph`, err);
      return {
        ok: false,
        tool: tool.actionKey,
        error: 'The connected records could not be read just now. Try again in a moment.',
      } satisfies ToolActionError;
    }

    const outcome = runTool(tool, graph, checked.arg);
    return outcome.ok ? outcome.result : ({ ok: false, tool: tool.actionKey, error: outcome.error } satisfies ToolActionError);
  };
}

const deps: ToolActionDeps = {
  loadGraph: (siteUrl, accountId) => loadSanitizedSiteGraph(siteUrl, accountId),
};

function action(name: string) {
  const tool = TRACEFLOW_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`TraceFlow tool ${name} is missing from the catalog`);
  return createToolAction(tool, deps);
}

// The question action keeps its richer handler (honest misses carry the
// answerable suggestions in the AnswerResult shape the agent prompt expects).
export { investigate } from './agent';

// One named export per catalog tool: the manifest's `handler: backend/tools.<name>`.
export const listPeople = action('traceflow_list_people');
export const personRisk = action('traceflow_person_risk');
export const personImpact = action('traceflow_person_impact');
export const epicLineage = action('traceflow_epic_lineage');
export const decisionTrace = action('traceflow_decision_trace');
export const epicImpact = action('traceflow_epic_impact');
export const decisionImpact = action('traceflow_decision_impact');
export const overview = action('traceflow_overview');
