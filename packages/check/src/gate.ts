import type { OrgGraph, RecordRef } from '@traceflow/core';

/**
 * The provenance gate: does a pull request trace back to recorded intent?
 *
 * Verdict rules (evidence-first, like every TraceFlow rule):
 *  - FAIL when no work item links to the pull request: the change has no
 *    recorded path from code back to intent.
 *  - FAIL when a linked work item implements a superseded decision: the code
 *    was built on an intent that has since been replaced.
 *  - PASS otherwise. A proposed (pending) decision does not fail the gate;
 *    work may legitimately start while approval is outstanding.
 */

export type CheckVerdict = 'pass' | 'fail';

export interface CheckReason {
  level: 'error' | 'info';
  message: string;
  evidence: RecordRef[];
}

export interface CheckResult {
  pr: RecordRef;
  verdict: CheckVerdict;
  reasons: CheckReason[];
}

/** Pure verdict for one pull request against a graph. Throws for an unknown id. */
export function checkPullRequest(graph: OrgGraph, prId: string): CheckResult {
  const pr = graph.pullRequests.find(
    (p) => p.ref.id.toLowerCase() === prId.trim().toLowerCase(),
  );
  if (!pr) {
    const known = graph.pullRequests.map((p) => p.ref.id).join(', ') || 'none';
    throw new Error(
      `No pull request matches '${prId}' in the connected data. Known pull requests: ${known}.`,
    );
  }

  const linkedItems = graph.workItems.filter((w) =>
    (w.linkedPullRequestIds ?? []).some((id) => id.toLowerCase() === pr.ref.id.toLowerCase()),
  );

  const reasons: CheckReason[] = [];

  if (linkedItems.length === 0) {
    reasons.push({
      level: 'error',
      message:
        'No work item links to this pull request, so the change has no recorded provenance from code to intent.',
      evidence: [pr.ref],
    });
  } else {
    reasons.push({
      level: 'info',
      message: `The change is linked to ${linkedItems.length} work item(s): ${linkedItems
        .map((w) => w.ref.id)
        .join(', ')}.`,
      evidence: linkedItems.map((w) => w.ref),
    });

    for (const item of linkedItems) {
      const decisions = graph.decisions.filter((d) =>
        (d.linkedWorkItemIds ?? []).some((id) => id === item.ref.id),
      );
      const superseded = decisions.filter((d) => d.status === 'superseded');
      const live = decisions.filter((d) => d.status !== 'superseded');

      if (superseded.length > 0) {
        for (const decision of superseded) {
          reasons.push({
            level: 'error',
            message: `${item.ref.id} implements '${decision.ref.title}', but that decision is superseded: the code is built on a replaced intent.`,
            evidence: [item.ref, decision.ref],
          });
        }
      }
      if (live.length > 0) {
        reasons.push({
          level: 'info',
          message: `${item.ref.id} is covered by ${live.length} live decision(s): ${live
            .map((d) => `${d.ref.title} (${d.status})`)
            .join('; ')}.`,
          evidence: live.map((d) => d.ref),
        });
      }
      if (decisions.length === 0) {
        reasons.push({
          level: 'info',
          message: `${item.ref.id} is not linked to any recorded decision; intent is the work item itself.`,
          evidence: [item.ref],
        });
      }
    }
  }

  return {
    pr: pr.ref,
    verdict: reasons.some((r) => r.level === 'error') ? 'fail' : 'pass',
    reasons,
  };
}
