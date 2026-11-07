import type { OrgGraph, PersonRiskReport, RecordRef, RiskWeights } from './types.js';
import { getIndex } from './graph-index.js';
import { DEFAULT_WEIGHTS, rankPeopleByRisk } from './risk.js';
import { traceEpic } from './lineage.js';

/** How many people the overview surfaces before it says "see all". */
export const OVERVIEW_TOP_PEOPLE = 3;

export interface OverviewCounts {
  people: number;
  epics: number;
  openWorkItems: number;
  /** Pages with exactly one recorded editor. */
  soleContributorPages: number;
  /** Non-superseded decisions with at least one outstanding approver. */
  pendingDecisions: number;
  openPullRequests: number;
}

export interface EpicSummary {
  epic: RecordRef;
  /** Open child issues of the epic. */
  openWork: number;
  /** Gaps found by `traceEpic` (missing spec, unapproved decision, missing implementation evidence). */
  gaps: number;
}

export interface OverviewReport {
  counts: OverviewCounts;
  /** Highest-risk people first, capped at `OVERVIEW_TOP_PEOPLE`. */
  topPeople: PersonRiskReport[];
  /** Epics ranked by gaps, then open work, then key (stable). */
  epics: EpicSummary[];
  /** What the connected data can and cannot show. */
  coverage: { confluence: boolean; code: boolean };
  caveats: string[];
}

const OVERVIEW_CAVEATS = [
  'Overview counts describe the connected Jira and Confluence records only; knowledge shared in chat, meetings or code review is not visible here.',
  'A sole-contributor page has one recorded editor; that cannot prove who else understands the content.',
];

/**
 * Organization-wide aggregates for the overview surface: counts from the records,
 * the top knowledge risks, and epics ranked by the gaps in their recorded links.
 * Deterministic: the same graph always yields the same report.
 */
export function buildOverview(
  graph: OrgGraph,
  weights: RiskWeights = DEFAULT_WEIGHTS,
): OverviewReport {
  const index = getIndex(graph);

  const counts: OverviewCounts = {
    people: graph.people.length,
    epics: index.epics.length,
    openWorkItems: graph.workItems.filter((w) => w.status === 'open').length,
    soleContributorPages: graph.pages.filter((p) => p.contributorIds.length === 1).length,
    pendingDecisions: graph.decisions.filter(
      (d) => d.status !== 'superseded' && d.pendingApproverIds.length > 0,
    ).length,
    openPullRequests: graph.pullRequests.filter((p) => p.state === 'open').length,
  };

  const topPeople = rankPeopleByRisk(graph, weights).slice(0, OVERVIEW_TOP_PEOPLE);

  const epics: EpicSummary[] = index.epics
    .map((w) => ({
      epic: w.ref,
      openWork: (index.childrenByEpic.get(w.ref.id) ?? []).filter((c) => c.status === 'open').length,
      gaps: traceEpic(graph, w.ref.id).gaps.length,
    }))
    .sort((a, b) => b.gaps - a.gaps || b.openWork - a.openWork || a.epic.id.localeCompare(b.epic.id));

  return {
    counts,
    topPeople,
    epics,
    coverage: {
      confluence: graph.pages.length + graph.decisions.length > 0,
      code: graph.pullRequests.length > 0,
    },
    caveats: OVERVIEW_CAVEATS,
  };
}
