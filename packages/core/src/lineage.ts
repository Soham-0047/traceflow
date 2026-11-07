import type {
  Decision,
  Finding,
  OrgGraph,
  Person,
  RecordRef,
  WorkItem,
} from './types.js';
import { getIndex } from './graph-index.js';

/** Left-to-right layers of a lineage graph: intent -> plan -> work -> code. */
export type Lane = 'intent' | 'plan' | 'work' | 'code';
export type EdgeKind = 'specifies' | 'contains' | 'implements';

export interface LineageNode {
  /** Unique within a report: `${source}:${id}`. */
  id: string;
  lane: Lane;
  ref: RecordRef;
  /** Record state when known (e.g. 'open', 'done', 'proposed', 'merged'). */
  status?: string;
}

export interface LineageEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface LineageCoverage {
  /** Whether any Confluence page or decision exists in the graph at all. */
  confluence: boolean;
  /** Whether any pull-request data is connected. If false, implementation gaps are not assessed. */
  code: boolean;
}

export interface LineageReport {
  epic: RecordRef;
  nodes: LineageNode[];
  edges: LineageEdge[];
  gaps: Finding[];
  coverage: LineageCoverage;
  caveats: string[];
}

export interface DecisionReport {
  decision: RecordRef;
  status: Decision['status'];
  linkedWork: RecordRef[];
  people: { person: Person; roles: string[] }[];
  findings: Finding[];
  caveats: string[];
}

export const nodeId = (ref: RecordRef): string => `${ref.source}:${ref.id}`;

const LINEAGE_CAVEATS = [
  'A missing link means no link was found in Jira or Confluence; the connection may exist elsewhere (chat, email, code comments).',
  'Lineage reflects recorded links only. It is evidence of traceability, not proof that a process was followed.',
];

const byRefId = (a: { ref: { id: string } }, b: { ref: { id: string } }): number =>
  a.ref.id.localeCompare(b.ref.id);

function decisionStateFindings(decision: Decision, linked: WorkItem[]): Finding[] {
  const findings: Finding[] = [];

  const doneAgainstProposal = linked.filter((w) => w.status === 'done');
  if (decision.status === 'proposed' && doneAgainstProposal.length > 0) {
    findings.push({
      kind: 'unapproved-decision',
      title: `Work was completed against a decision that is still only proposed`,
      detail: `"${decision.ref.title}" has no recorded approval, but ${doneAgainstProposal.length} linked item(s) are already done.`,
      confidence: 'medium',
      evidence: [decision.ref, ...doneAgainstProposal.map((w) => w.ref)],
      points: 0,
      suggestedActions: ['Record the approval (or the reason it was not needed)', 'Confirm the completed work still matches the final decision'],
    });
  }

  const openAgainstSuperseded = linked.filter((w) => w.status === 'open');
  if (decision.status === 'superseded' && openAgainstSuperseded.length > 0) {
    findings.push({
      kind: 'superseded-decision-in-use',
      title: `Open work still references a superseded decision`,
      detail: `"${decision.ref.title}" was superseded, but ${openAgainstSuperseded.length} open item(s) still link to it, so they may be outdated.`,
      confidence: 'medium',
      evidence: [decision.ref, ...openAgainstSuperseded.map((w) => w.ref)],
      points: 0,
      suggestedActions: ['Review each item against the superseding decision', 'Update or close items that are no longer valid'],
    });
  }

  return findings;
}

/**
 * Trace an epic back to its recorded intent (pages, decisions) and forward to
 * its work and code. Gaps are evidence-based and respect data coverage.
 * Uses the shared graph index: one build serves every epic and every surface.
 */
export function traceEpic(graph: OrgGraph, epicId: string): LineageReport {
  const index = getIndex(graph);
  const epic = index.workById.get(epicId);
  if (!epic || epic.type !== 'epic') throw new Error(`Unknown epic: ${epicId}`);

  // Children in canonical id order so any input order yields the same report.
  const children = [...(index.childrenByEpic.get(epicId) ?? [])].sort(byRefId);
  const members = [epic, ...children];
  const memberIds = new Set(members.map((m) => m.ref.id));

  const nodes = new Map<string, LineageNode>();
  const edges = new Map<string, LineageEdge>();
  const addNode = (ref: RecordRef, lane: Lane, status?: string) => {
    const id = nodeId(ref);
    if (!nodes.has(id)) nodes.set(id, { id, lane, ref, status });
    return id;
  };
  const addEdge = (from: string, to: string, kind: EdgeKind) => {
    edges.set(`${from}|${to}|${kind}`, { from, to, kind });
  };

  const epicNode = addNode(epic.ref, 'plan', epic.status);
  for (const child of children) {
    addEdge(epicNode, addNode(child.ref, 'work', child.status), 'contains');
  }

  // Intent: pages or decisions linked from the epic or its issues, in canonical
  // id order so any input ordering yields the same report.
  for (const m of members) {
    const to = nodeId(m.ref);
    for (const pid of [...new Set(m.linkedPageIds ?? [])].sort()) {
      const decision = index.decisionsById.get(pid);
      const page = index.pagesById.get(pid);
      const target = decision?.ref ?? page?.ref;
      if (target) addEdge(addNode(target, 'intent', decision?.status), to, 'specifies');
    }
  }
  // Decisions that name a member in linkedWorkItemIds.
  for (const wid of memberIds) {
    for (const decision of index.decisionsByLinkedWorkItemId.get(wid) ?? []) {
      const member = members.find((m) => m.ref.id === wid)!;
      addEdge(addNode(decision.ref, 'intent', decision.status), nodeId(member.ref), 'specifies');
    }
  }

  // Code: pull requests linked from the epic or its issues.
  for (const m of members) {
    for (const prId of m.linkedPullRequestIds ?? []) {
      const pr = index.pullRequestsById.get(prId);
      if (pr) addEdge(addNode(pr.ref, 'code', pr.state), nodeId(m.ref), 'implements');
    }
  }

  const coverage: LineageCoverage = {
    confluence: graph.pages.length + graph.decisions.length > 0,
    code: graph.pullRequests.length > 0,
  };

  const gaps: Finding[] = [];
  const intentNodes = [...nodes.values()].filter((n) => n.lane === 'intent');

  if (intentNodes.length === 0 && coverage.confluence) {
    gaps.push({
      kind: 'no-recorded-spec',
      title: 'No linked specification or decision for this epic',
      detail: 'Neither the epic nor its issues link to a Confluence page or decision, so the original intent cannot be traced.',
      confidence: 'medium',
      evidence: [epic.ref],
      points: 0,
      suggestedActions: ['Link the specification or decision page to the epic', 'If none exists, write a short decision record'],
    });
  }

  if (coverage.code) {
    const doneNoPr = children.filter((c) => c.status === 'done' && !(c.linkedPullRequestIds?.length));
    if (doneNoPr.length > 0) {
      gaps.push({
        kind: 'done-without-implementation',
        title: `${doneNoPr.length} finished issue(s) have no linked pull request`,
        detail: 'These issues are done, but no implementation evidence is linked to them.',
        confidence: 'medium',
        evidence: doneNoPr.map((c) => c.ref),
        points: 0,
        suggestedActions: ['Link the pull request that delivered each issue', 'Note why no code change was needed, if that is the case'],
      });
    }
  }

  for (const node of intentNodes) {
    const decision = index.decisionsById.get(node.ref.id);
    if (!decision) continue;
    const linked = members.filter((m) => edges.has(`${node.id}|${nodeId(m.ref)}|specifies`));
    gaps.push(...decisionStateFindings(decision, linked));
  }

  const caveats = [...LINEAGE_CAVEATS];
  if (!coverage.code) {
    caveats.push('No pull-request data is connected, so implementation evidence was not assessed.');
  }

  return {
    epic: epic.ref,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    gaps,
    coverage,
    caveats,
  };
}

/** Investigate one decision: what it drives, who is involved, and whether it is stale or unapproved. */
export function traceDecision(graph: OrgGraph, decisionId: string): DecisionReport {
  const index = getIndex(graph);
  const decision = index.decisionsById.get(decisionId);
  if (!decision) throw new Error(`Unknown decision: ${decisionId}`);

  // Linked work: items whose remote links point at the decision page, plus
  // items the decision names directly. Canonical id order.
  const linkedMap = new Map<string, WorkItem>();
  for (const item of index.workByLinkedPageId.get(decision.ref.id) ?? []) {
    linkedMap.set(item.ref.id, item);
  }
  for (const wid of decision.linkedWorkItemIds ?? []) {
    const item = index.workById.get(wid);
    if (item) linkedMap.set(item.ref.id, item);
  }
  const linked = [...linkedMap.values()].sort(byRefId);

  const roles = new Map<string, Set<string>>();
  const addRole = (personId: string | undefined, role: string) => {
    if (!personId) return;
    if (!roles.has(personId)) roles.set(personId, new Set());
    roles.get(personId)!.add(role);
  };

  addRole(decision.ownerId, 'decision owner');
  for (const id of decision.pendingApproverIds) addRole(id, 'pending approver');
  for (const w of linked) {
    addRole(w.assigneeId, 'assignee of linked work');
    for (const prId of w.linkedPullRequestIds ?? []) {
      const pr = index.pullRequestsById.get(prId);
      addRole(pr?.authorId, 'author of linked pull request');
    }
  }

  const people = graph.people
    .filter((p) => roles.has(p.id))
    .map((person) => ({ person, roles: [...roles.get(person.id)!] }))
    .sort((a, b) => a.person.id.localeCompare(b.person.id));

  const findings = decisionStateFindings(decision, linked);
  if (decision.status !== 'superseded' && decision.pendingApproverIds.length > 0) {
    const names = decision.pendingApproverIds
      .map((id) => index.peopleById.get(id)?.name ?? id)
      .join(', ');
    findings.push({
      kind: 'pending-decision',
      title: 'Decision is waiting on input',
      detail: `Outstanding approver(s): ${names}.`,
      confidence: 'high',
      evidence: [decision.ref],
      points: 0,
      suggestedActions: ['Name a delegate for each outstanding approver', 'Set a date to record the final decision'],
    });
  }

  return {
    decision: decision.ref,
    status: decision.status,
    linkedWork: linked.map((w) => w.ref),
    people,
    findings,
    caveats: LINEAGE_CAVEATS,
  };
}
