import type {
  Finding,
  OrgGraph,
  PersonRiskReport,
  RiskLevel,
  RiskWeights,
} from './types.js';

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
  const person = graph.people.find((p) => p.id === personId);
  if (!person) throw new Error(`Unknown person: ${personId}`);

  const findings: Finding[] = [];

  const soloPages = graph.pages.filter(
    (p) => p.contributorIds.length === 1 && p.contributorIds[0] === personId,
  );
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

  const openWork = graph.workItems.filter(
    (w) => w.assigneeId === personId && w.status === 'open',
  );
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

  const openPrs = graph.pullRequests.filter(
    (p) => p.authorId === personId && p.state === 'open',
  );
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

  const pending = graph.decisions.filter(
    (d) => d.status !== 'superseded' && d.pendingApproverIds.includes(personId),
  );
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

  return {
    personId,
    personName: person.name,
    score,
    level: levelFor(score),
    findings,
    caveats: CAVEATS,
  };
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
