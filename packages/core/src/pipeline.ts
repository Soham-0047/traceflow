import type { OrgGraph, PersonRiskReport, RiskWeights } from './types.js';
import { ValidationError } from './errors.js';
import type { ValidationIssue } from './validate.js';
import { parseOrgGraphJson, sanitizeGraph, strictGraph } from './validate.js';
import { getIndex, graphFingerprint, type GraphIndex } from './graph-index.js';
import { rankPeopleByRisk } from './risk.js';
import { buildOverview, type OverviewReport } from './overview.js';
import { personImpact, type PersonImpactReport } from './impact.js';
import { traceEpic, traceDecision, type DecisionReport, type LineageReport } from './lineage.js';

/**
 * The single entry point every surface goes through — UI hosts, the MCP
 * server, the check gate, the Forge resolver, future connectors:
 *
 *     untrusted input ──▶ validate ──▶ sanitize ──▶ index + fingerprint ──▶ engines
 *                          (bounded)   (fault-     (shared, memoized)       (deterministic,
 *                                      isolating)                            evidence-first)
 *
 * Two modes:
 *  - 'strict'      refuses the whole input when anything structural is wrong.
 *                  Used for exports and gates, where silent record loss
 *                  would change a verdict or hide a risk.
 *  - 'best-effort' quarantines broken records and drops dangling
 *                  cross-references, keeping the surface alive. Used for
 *                  live sources. Everything removed is reported, never silent.
 *
 * The result carries the graph, the shared index (so engines do not re-scan),
 * a fingerprint (so caches can tell whether anything changed), the warnings
 * and — in best-effort mode — every rejected record with its reason.
 */

export type PipelineMode = 'strict' | 'best-effort';

export interface PipelineOptions {
  mode?: PipelineMode;
  /** Label for error messages (e.g. the export path). */
  context?: string;
  weights?: RiskWeights;
}

export interface PipelineResult {
  graph: OrgGraph;
  index: GraphIndex;
  fingerprint: string;
  /** Cross-reference and quarantine notices. May be non-empty when ok. */
  warnings: ValidationIssue[];
  /** Best-effort only: records removed, with reasons. Empty in strict mode. */
  rejected: { path: string; reason: string }[];
}

export function runPipeline(input: unknown, options: PipelineOptions = {}): PipelineResult {
  const mode: PipelineMode = options.mode ?? 'strict';
  const context = options.context ?? 'input';

  if (mode === 'strict') {
    const { graph, warnings } = strictGraph(input, context);
    return {
      graph,
      index: getIndex(graph),
      fingerprint: graphFingerprint(graph),
      warnings,
      rejected: [],
    };
  }

  const { graph, warnings, rejected } = sanitizeGraph(input, context);
  return {
    graph,
    index: getIndex(graph),
    fingerprint: graphFingerprint(graph),
    warnings,
    rejected,
  };
}

/**
 * Parse a JSON export (byte-capped, validated, strict) and run the pipeline.
 * Throws ValidationError listing every issue found. This is what the MCP
 * server and the check gate use for graph files.
 */
export function runPipelineOnJson(text: string, options: Omit<PipelineOptions, 'mode'> = {}): PipelineResult {
  const { graph, warnings } = parseOrgGraphJson(text, options.context ?? 'OrgGraph export');
  return {
    graph,
    index: getIndex(graph),
    fingerprint: graphFingerprint(graph),
    warnings,
    rejected: [],
  };
}

/** Every engine report over a graph, in one deterministic call. Used by the e2e harness and power surfaces. */
export interface AnalysisResult {
  fingerprint: string;
  overview: OverviewReport;
  rankedPeople: PersonRiskReport[];
  impacts: PersonImpactReport[];
  lineages: LineageReport[];
  decisionReports: DecisionReport[];
}

export function analyzeAll(graph: OrgGraph, weights?: RiskWeights): AnalysisResult {
  const index = getIndex(graph);
  return {
    fingerprint: graphFingerprint(graph),
    overview: buildOverview(graph, weights),
    rankedPeople: rankPeopleByRisk(graph, weights),
    // Canonical collection order (by id): the same records in any input order
    // produce byte-identical JSON — the property the e2e determinism check asserts.
    impacts: graph.people
      .map((p) => personImpact(graph, p.id))
      .sort((a, b) => a.personId.localeCompare(b.personId)),
    lineages: index.epics
      .map((epic) => traceEpic(graph, epic.ref.id))
      .sort((a, b) => a.epic.id.localeCompare(b.epic.id)),
    decisionReports: graph.decisions
      .map((d) => traceDecision(graph, d.ref.id))
      .sort((a, b) => a.decision.id.localeCompare(b.decision.id)),
  };
}

export { ValidationError };
