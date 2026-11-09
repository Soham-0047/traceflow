import type {
  Finding,
  OrgGraph,
  PersonRiskReport,
  RiskLevel,
  RiskWeights,
} from './types.js';
import { getIndex } from './graph-index.js';

/** Transparent, adjustable weights. The UI should show the arithmetic. */
export const DEFAULT_WEIGHTS: RiskWeights = {
  solePage: 5,
  openWork: 2,
  openPullRequest: 4,
  pendingDecision: 6,
};

const CAVEATS = [
  'Sole contributor is not the same as sole knowledge holder: activity data cannot prove who understands something.',
  'Findings come from Atlassian records only; knowledge shared in chat, meetings or code is not visible here.',
];

/* ------------------------------------------------------------------ *
 * Per-graph report memo. assessPersonRisk is a pure function of
 * (graph, personId, weights), and the hot paths ask for the same reports
 * over and over: the top-risks ranking scores every person, the overview
 * re-ranks them, and chat traffic repeats questions. Without the memo a
 * single "top risks" question re-scans every page, work item, pull request
 * and decision once per person (measured: ~21 ms per question on the
 * synthetic 7,150-record org); with it, the first ranking warms the cache
 * and every later ranking or person question is a map lookup.
 *
 * Keys combine the weights (serialized canonically, so two equal weights
 * objects share an entry) with the person id; the memo is a WeakMap on the
 * graph object, so it dies with the graph and never leaks. Graphs are
 * immutable by contract (the shared GraphIndex already relies on that),
 * so a cached report can never go stale. FIFO-evicted past the cap.
 * ------------------------------------------------------------------ */

const REPORT_CACHE = new WeakMap<OrgGraph, Map<string, PersonRiskReport>>();
/** Reports per graph: a 250-person org uses 250; the cap only bounds degenerate graphs. */
const REPORT_CACHE_MAX = 2048;

function weightsCacheKey(weights: RiskWeights): string {
  return Object.keys(weights)
    .sort()
    .map((key) => `${key}=${weights[key as keyof RiskWeights]}`)
    .join(',');
}

/** Cache stats for tests and observability: how many reports are memoized per graph. */
export function riskReportCacheSize(graph: OrgGraph): number {
  return REPORT_CACHE.get(graph)?.size ?? 0;
}

export function levelFor(score: number): RiskLevel {
  if (score >= 60) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

/**
 * Evidence-first knowledge-risk assessment for one person.
 * Deterministic: the same graph always yields the same report.
 */
export function assessPersonRisk(
  graph: OrgGraph,
  personId: string,
  weights: RiskWeights = DEFAULT_WEIGHTS,
): PersonRiskReport {
  const cacheKey = `${weightsCacheKey(weights)}|${personId}`;
  let reports = REPORT_CACHE.get(graph);
  if (!reports) {
    reports = new Map();
    REPORT_CACHE.set(graph, reports);
  }
  const cached = reports.get(cacheKey);
  if (cached) return cached;

  const index = getIndex(graph);
  const person = index.peopleById.get(personId);
  if (!person) throw new Error(`Unknown person: ${personId}`);

  const findings: Finding[] = [];

  // Canonical order (by record id) so the same graph in any input order
  // produces the same report — stable UI, stable diffs, cacheable answers.
  const byId = <T extends { ref: { id: string } }>(a: T, b: T): number => a.ref.id.localeCompare(b.ref.id);

  const soloPages = graph.pages
    .filter((p) => p.contributorIds.length === 1 && p.contributorIds[0] === personId)
    .sort(byId);
  if (soloPages.length > 0) {
    findings.push({
      kind: 'sole-contributor-page',
      title: `${soloPages.length} page(s) where ${person.name} is the only contributor`,
      detail: 'No other recorded editor, so nobody else has visibly worked on these pages.',
      confidence: 'medium',
      evidence: soloPages.map((p) => p.ref),
      points: soloPages.length * weights.solePage,
      suggestedActions: [
        'Assign a backup owner for each page',
        'Schedule a knowledge-transfer session',
      ],
    });
  }

  const openWork = graph.workItems
    .filter((w) => w.assigneeId === personId && w.status === 'open')
    .sort(byId);
  if (openWork.length > 0) {
    findings.push({
      kind: 'open-work',
      title: `${openWork.length} unresolved issue(s) assigned to ${person.name}`,
      detail: 'Open work items that will stall without a new assignee.',
      confidence: 'high',
      evidence: openWork.map((w) => w.ref),
      points: openWork.length * weights.openWork,
      suggestedActions: ['Review and reassign unresolved work', 'Close issues that are no longer needed'],
    });
  }

  const openPrs = graph.pullRequests
    .filter((p) => p.authorId === personId && p.state === 'open')
    .sort(byId);
  if (openPrs.length > 0) {
    findings.push({
      kind: 'open-pull-request',
      title: `${openPrs.length} open pull request(s) authored by ${person.name}`,
      detail: 'Unmerged implementation work that needs a new owner or a review decision.',
      confidence: 'high',
      evidence: openPrs.map((p) => p.ref),
      points: openPrs.length * weights.openPullRequest,
      suggestedActions: ['Hand off or close each pull request', 'Document the intent of each change'],
    });
  }

  const pending = graph.decisions
    .filter(
      (d) => d.status !== 'superseded' && d.pendingApproverIds.includes(personId),
    )
    .sort(byId);
  if (pending.length > 0) {
    findings.push({
      kind: 'pending-decision',
      title: `${pending.length} decision(s) awaiting ${person.name}'s input`,
      detail: 'Decisions that cannot be finalised without this person or a delegate.',
      confidence: 'high',
      evidence: pending.map((d) => d.ref),
      points: pending.length * weights.pendingDecision,
      suggestedActions: ['Name a delegate approver', 'Record the decision before the handover date'],
    });
  }

  const score = Math.min(100, findings.reduce((sum, f) => sum + f.points, 0));

  const report: PersonRiskReport = {
    personId,
    personName: person.name,
    score,
    level: levelFor(score),
    findings,
    caveats: CAVEATS,
  };
  reports.set(cacheKey, report);
  if (reports.size > REPORT_CACHE_MAX) {
    // Map iterates in insertion order: drop the oldest entry.
    reports.delete(reports.keys().next().value as string);
  }
  return report;
}

/** Everyone in the graph, highest risk first (ties broken by name for stable output). */
export function rankPeopleByRisk(
  graph: OrgGraph,
  weights: RiskWeights = DEFAULT_WEIGHTS,
): PersonRiskReport[] {
  return graph.people
    .map((p) => assessPersonRisk(graph, p.id, weights))
    .sort((a, b) => b.score - a.score || a.personName.localeCompare(b.personName));
}
