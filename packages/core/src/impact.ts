import type { Confidence, Decision, Finding, OrgGraph, Person, RecordRef, WorkItem } from './types.js';
import { getIndex } from './graph-index.js';
import { traceEpic } from './lineage.js';

/**
 * What kind of thing is affected by a change. The first five kinds answer
 * "what loses an owner when a person becomes unavailable"; the last five
 * answer "what is affected when an epic or a decision changes".
 */
export type ImpactAreaKind =
  | 'stalled-epic'
  | 'stalled-work'
  | 'orphaned-page'
  | 'blocked-decision'
  | 'unmerged-change'
  | 'orphaned-work'
  | 'stale-spec'
  | 'unreviewed-change'
  | 'outdated-work'
  | 'outdated-change';

/** One affected thing: what it is, why it is affected, and the records that show it. */
export interface ImpactArea {
  kind: ImpactAreaKind;
  title: string;
  detail: string;
  confidence: Confidence;
  /** Records that support this area. Never empty. */
  evidence: RecordRef[];
  suggestedActions: string[];
}

export interface ImpactCounts {
  stalledEpics: number;
  stalledWork: number;
  orphanedPages: number;
  blockedDecisions: number;
  unmergedChanges: number;
}

/** The blast radius of one person, from the connected records only. */
export interface PersonImpactReport {
  personId: string;
  personName: string;
  areas: ImpactArea[];
  counts: ImpactCounts;
  caveats: string[];
}

/** Plain-language description of how each area kind is detected. Shown in the evidence panel. */
export const IMPACT_RULES: Record<ImpactAreaKind, string> = {
  'stalled-epic':
    'The epic contains open issues assigned to this person, or this person owns the epic record itself, so the epic loses work or its driver if they leave.',
  'stalled-work':
    'An open issue assigned to this person belongs to no epic, so it loses its only recorded owner.',
  'orphaned-page':
    'The page has exactly one recorded contributor: this person. Nobody else has visibly edited it.',
  'blocked-decision':
    'The decision is not superseded and either waits on this person as an outstanding approver, or names this person as its owner.',
  'unmerged-change':
    'A pull request authored by this person is still open, so the change loses its author.',
  'orphaned-work':
    'The issue is open and sits in this epic, so a change to the epic (a scope change or cancellation) takes away its recorded plan.',
  'stale-spec':
    'The page or decision is linked to the epic or one of its issues, so a change to the epic makes it worth re-checking against the new plan.',
  'unreviewed-change':
    'The pull request is still open and implements work in this epic, so if the scope changes it may no longer match the recorded intent.',
  'outdated-work':
    'The open issue is linked to this decision, so a change to the decision (a supersession or reversal) means the work must be reviewed against it.',
  'outdated-change':
    'The pull request is still open and implements work linked to this decision, so if the decision changes it may implement the wrong intent.',
};

const CAVEATS = [
  'Impact lists what the connected records show would lose an owner; knowledge shared outside Jira, Confluence and Bitbucket is not visible here.',
  'Sole contributor is not the same as sole knowledge holder: activity data cannot prove who understands something.',
];

interface ImpactedEpic {
  epic: WorkItem;
  /** Open, non-epic items in this epic assigned to the person. */
  items: WorkItem[];
  /** The person also owns the epic record itself. */
  ownsEpic: boolean;
}

/** Epics the person affects: through open work inside them, or by owning the epic record. */
function impactedEpics(graph: OrgGraph, personId: string): ImpactedEpic[] {
  const index = getIndex(graph);
  const result: ImpactedEpic[] = [];
  for (const epic of index.epics) {
    const items = (index.childrenByEpic.get(epic.ref.id) ?? [])
      .filter((item) => item.assigneeId === personId && item.status === 'open')
      .sort((a, b) => a.ref.id.localeCompare(b.ref.id));
    const ownsEpic = epic.assigneeId === personId && epic.status === 'open';
    if (items.length > 0 || ownsEpic) result.push({ epic, items, ownsEpic });
  }
  return result;
}

/** Open, non-epic items assigned to the person that sit in no epic at all. */
function loneWork(graph: OrgGraph, personId: string): WorkItem[] {
  const items: WorkItem[] = [];
  for (const item of graph.workItems) {
    if (item.type === 'epic' || item.epicId) continue;
    if (item.assigneeId === personId && item.status === 'open') items.push(item);
  }
  // Canonical order: the same graph in any input order yields the same report.
  return items.sort((a, b) => a.ref.id.localeCompare(b.ref.id));
}

/**
 * What breaks if this person becomes unavailable: every epic, page, decision and
 * pull request the connected records tie to them alone. Deterministic.
 */
export function personImpact(graph: OrgGraph, personId: string): PersonImpactReport {
  const index = getIndex(graph);
  const person = index.peopleById.get(personId);
  if (!person) throw new Error(`Unknown person: ${personId}`);

  const areas: ImpactArea[] = [];

  // Stalled epics first, in canonical epic order.
  const stalled = impactedEpics(graph, personId).sort((a, b) => a.epic.ref.id.localeCompare(b.epic.ref.id));
  for (const { epic, items, ownsEpic } of stalled) {
    const evidence = [epic.ref, ...items.map((i) => i.ref)];
    const stalledTitle =
      items.length > 0
        ? `${items.length} open issue(s) in ${epic.ref.title} stall with ${person.name}`
        : `${epic.ref.title} loses its recorded owner`;
    const stalledDetail =
      items.length > 0
        ? `Open work in this epic is assigned to ${person.name}` +
          (ownsEpic
            ? `, who also owns the epic record itself, so it loses both its work and its driver.`
            : '. The epic loses its active work if they leave.')
        : `${person.name} owns this epic record; no other driver is recorded on it.`;
    areas.push({
      kind: 'stalled-epic',
      title: stalledTitle,
      detail: stalledDetail,
      confidence: 'high',
      evidence,
      suggestedActions: ['Reassign the open issues', 'Record the intended next step on each issue'],
    });
  }

  // Lone open work outside any epic.
  for (const item of loneWork(graph, personId)) {
    areas.push({
      kind: 'stalled-work',
      title: `${item.ref.title} has no other recorded owner`,
      detail: `This open issue is assigned to ${person.name} and sits in no epic, so nobody else is tied to it.`,
      confidence: 'high',
      evidence: [item.ref],
      suggestedActions: ['Move the issue into an epic or project', 'Name a new assignee'],
    });
  }

  // Orphaned knowledge: pages where this person is the only recorded contributor.
  const soloPages = graph.pages
    .filter((p) => p.contributorIds.length === 1 && p.contributorIds[0] === personId)
    .sort((a, b) => a.ref.id.localeCompare(b.ref.id));
  for (const page of soloPages) {
    areas.push({
      kind: 'orphaned-page',
      title: page.ref.title,
      detail: `${person.name} is the only recorded contributor on this page. No other editor is tied to this knowledge.`,
      confidence: 'medium',
      evidence: [page.ref],
      suggestedActions: ['Add a second contributor or reviewer', 'Schedule a knowledge-transfer session'],
    });
  }

  // Blocked decisions: this person drives them or must approve them.
  const blocked = graph.decisions
    .filter(
      (d) =>
        d.status !== 'superseded' &&
        (d.ownerId === personId || d.pendingApproverIds.includes(personId)),
    )
    .sort((a, b) => a.ref.id.localeCompare(b.ref.id));
  for (const decision of blocked) {
    const isOwner = decision.ownerId === personId;
    const isApprover = decision.pendingApproverIds.includes(personId);
    const reason = isOwner
      ? `${person.name} owns this decision; if they leave, nobody is recorded to drive it to approval.`
      : `${person.name} is an outstanding approver; the decision cannot be finalised without them or a delegate.`;
    areas.push({
      kind: 'blocked-decision',
      title: decision.ref.title,
      detail: reason + (isOwner && isApprover ? ' They are also still listed as an outstanding approver.' : ''),
      confidence: 'high',
      evidence: [decision.ref],
      suggestedActions: isOwner
        ? ['Name a new decision owner', 'Record the decision before the handover date']
        : ['Name a delegate approver', 'Record the decision before the handover date'],
    });
  }

  // Unmerged changes: open pull requests authored by this person.
  const openPrs = graph.pullRequests
    .filter((p) => p.authorId === personId && p.state === 'open')
    .sort((a, b) => a.ref.id.localeCompare(b.ref.id));
  for (const pr of openPrs) {
    areas.push({
      kind: 'unmerged-change',
      title: pr.ref.title,
      detail: `This pull request is authored by ${person.name} and still open. The change loses its author if they leave.`,
      confidence: 'high',
      evidence: [pr.ref],
      suggestedActions: ['Hand the review to another engineer', 'Close it if the intent is no longer current'],
    });
  }

  const counts: ImpactCounts = {
    stalledEpics: areas.filter((a) => a.kind === 'stalled-epic').length,
    stalledWork: areas.filter((a) => a.kind === 'stalled-work').length,
    orphanedPages: areas.filter((a) => a.kind === 'orphaned-page').length,
    blockedDecisions: areas.filter((a) => a.kind === 'blocked-decision').length,
    unmergedChanges: areas.filter((a) => a.kind === 'unmerged-change').length,
  };

  return {
    personId,
    personName: person.name,
    areas,
    counts,
    caveats: CAVEATS,
  };
}

/* ------------------------------------------------------------------ *
 * Epic impact: what is affected if the epic changes
 * ------------------------------------------------------------------ */

export interface EpicImpactCounts {
  /** Open child issues that lose their recorded plan. */
  orphanedWork: number;
  /** Pages and decisions linked to the epic or its issues. */
  staleSpecs: number;
  /** Open pull requests linked from open work in the epic. */
  unreviewedChanges: number;
}

/** A person tied to the change through records, and the roles that tie them. */
export interface ImpactPerson {
  person: Person;
  roles: string[];
}

/** The blast radius of a change to one epic, from the connected records only. */
export interface EpicImpactReport {
  epic: RecordRef;
  areas: ImpactArea[];
  counts: EpicImpactCounts;
  /** Who is tied to the epic through records — the people who need to know. */
  people: ImpactPerson[];
  /** Pre-existing lineage gaps of this epic (missing spec, unapproved decision, missing implementation evidence). */
  gaps: Finding[];
  caveats: string[];
}

/** Decision impact caveats: what a change report cannot prove. */
const EPIC_IMPACT_CAVEATS = [
  'Impact assumes a change to the epic (a scope change or cancellation); the records cannot show which parts of the scope would actually change.',
  'Pages and decisions are listed because they link to the epic; the records cannot show whether their content is still accurate.',
];

const byRefId = (a: { ref: { id: string } }, b: { ref: { id: string } }): number =>
  a.ref.id.localeCompare(b.ref.id);

/** Roles collector shared by the epic and decision impact reports. */
class RoleBook {
  private byId = new Map<string, Set<string>>();

  add(personId: string | undefined, role: string): void {
    if (!personId) return;
    const roles = this.byId.get(personId);
    if (roles) roles.add(role);
    else this.byId.set(personId, new Set([role]));
  }

  /** People in canonical id order, each with alphabetically sorted roles. */
  people(graph: OrgGraph): ImpactPerson[] {
    return graph.people
      .filter((p) => this.byId.has(p.id))
      .map((person) => ({ person, roles: [...this.byId.get(person.id)!].sort() }))
      .sort((a, b) => a.person.id.localeCompare(b.person.id));
  }
}

/**
 * What is affected if this epic changes (its scope moves or it is cancelled):
 * the open work that loses its recorded plan, the specifications linked to it,
 * the unmerged changes that may implement outdated intent, and the people tied
 * to it through records. Deterministic and coverage-aware.
 */
export function epicImpact(graph: OrgGraph, epicId: string): EpicImpactReport {
  const index = getIndex(graph);
  const epic = index.workById.get(epicId);
  if (!epic || epic.type !== 'epic') throw new Error(`Unknown epic: ${epicId}`);

  // Canonical children (open and done) in id order.
  const children = [...(index.childrenByEpic.get(epicId) ?? [])].sort(byRefId);
  const openChildren = children.filter((c) => c.status === 'open');

  // Intent records linked from the epic or any child (pages and decisions),
  // plus decisions that name a member in linkedWorkItemIds — the same linkage
  // traceEpic uses, so the two reports agree by construction.
  const intent = new Map<string, { ref: RecordRef; status?: string }>();
  const linkedDecisions = new Map<string, Decision>();
  const members = [epic, ...children];
  for (const m of members) {
    for (const pid of [...new Set(m.linkedPageIds ?? [])]) {
      const decision = index.decisionsById.get(pid);
      const page = index.pagesById.get(pid);
      if (decision) {
        intent.set(pid, { ref: decision.ref, status: decision.status });
        linkedDecisions.set(pid, decision);
      } else if (page) {
        intent.set(pid, { ref: page.ref });
      }
    }
  }
  for (const m of members) {
    for (const decision of index.decisionsByLinkedWorkItemId.get(m.ref.id) ?? []) {
      intent.set(decision.ref.id, { ref: decision.ref, status: decision.status });
      linkedDecisions.set(decision.ref.id, decision);
    }
  }

  const areas: ImpactArea[] = [];

  // Open work first, in canonical order: each open issue loses its recorded plan.
  for (const item of openChildren) {
    areas.push({
      kind: 'orphaned-work',
      title: `${item.ref.title} loses its recorded plan`,
      detail:
        `This open issue sits in ${epic.ref.title}; if the epic's scope changes or it is cancelled, ` +
        `the issue loses the recorded plan it belongs to.`,
      confidence: 'high',
      evidence: [epic.ref, item.ref],
      suggestedActions: ['Re-parent the issue, or record its new plan on the issue itself'],
    });
  }

  // Stale specifications: every linked intent record, in canonical order.
  for (const { ref, status } of [...intent.values()].sort((a, b) => a.ref.id.localeCompare(b.ref.id))) {
    const statusText = status ? ` It is still recorded as ${status}.` : '';
    areas.push({
      kind: 'stale-spec',
      title: ref.title,
      detail:
        `${ref.title} is linked to ${epic.ref.title}. A change to the epic makes it worth ` +
        `re-checking this record against the new plan.${statusText}`,
      confidence: 'medium',
      evidence: [epic.ref, ref],
      suggestedActions: ['Review the record against the new plan', 'Update or mark it superseded where it no longer applies'],
    });
  }

  // Unreviewed changes: open pull requests linked from open work, deduplicated by pr id.
  const seenPrs = new Set<string>();
  for (const item of openChildren) {
    for (const prId of [...new Set(item.linkedPullRequestIds ?? [])].sort()) {
      const pr = index.pullRequestsById.get(prId);
      if (!pr || pr.state !== 'open' || seenPrs.has(prId)) continue;
      seenPrs.add(prId);
      areas.push({
        kind: 'unreviewed-change',
        title: pr.ref.title,
        detail:
          `This open pull request implements ${item.ref.title} in ${epic.ref.title}. ` +
          `If the epic's scope changes, review whether the change still matches the recorded intent.`,
        confidence: 'medium',
        evidence: [epic.ref, item.ref, pr.ref],
        suggestedActions: ['Re-review the change against the new plan', 'Close it if the intent is no longer current'],
      });
    }
  }

  // Who needs to know, through records only.
  const roles = new RoleBook();
  roles.add(epic.assigneeId, 'owns the epic record');
  for (const item of openChildren) roles.add(item.assigneeId, 'holds open work in this epic');
  for (const decision of linkedDecisions.values()) {
    roles.add(decision.ownerId, 'owns a decision linked to this epic');
    for (const id of decision.pendingApproverIds) {
      roles.add(id, 'is still approving a decision linked to this epic');
    }
  }

  const counts: EpicImpactCounts = {
    orphanedWork: areas.filter((a) => a.kind === 'orphaned-work').length,
    staleSpecs: areas.filter((a) => a.kind === 'stale-spec').length,
    unreviewedChanges: areas.filter((a) => a.kind === 'unreviewed-change').length,
  };

  return {
    epic: epic.ref,
    areas,
    counts,
    people: roles.people(graph),
    gaps: traceEpic(graph, epicId).gaps,
    caveats: EPIC_IMPACT_CAVEATS,
  };
}

/* ------------------------------------------------------------------ *
 * Decision impact: what is affected if the decision changes
 * ------------------------------------------------------------------ */

export interface DecisionImpactCounts {
  /** Open work items linked to the decision. */
  outdatedWork: number;
  /** Open pull requests linked from that open work. */
  outdatedChanges: number;
}

/** The blast radius of a change to one decision, from the connected records only. */
export interface DecisionImpactReport {
  decision: RecordRef;
  status: Decision['status'];
  areas: ImpactArea[];
  counts: DecisionImpactCounts;
  /** Who is tied to the decision through records — the people who need to know. */
  people: ImpactPerson[];
  caveats: string[];
}

const DECISION_IMPACT_CAVEATS = [
  'Impact assumes a change to the decision (a supersession or reversal); the records cannot show which conclusions would actually change.',
  'Work is listed because it links to the decision; the records cannot show how much of that work truly depends on it.',
];

/**
 * What is affected if this decision changes (it is superseded or reversed):
 * the open work linked to it, the unmerged changes implementing that work, and
 * the people tied to it through records. Deterministic and coverage-aware.
 */
export function decisionImpact(graph: OrgGraph, decisionId: string): DecisionImpactReport {
  const index = getIndex(graph);
  const decision = index.decisionsById.get(decisionId);
  if (!decision) throw new Error(`Unknown decision: ${decisionId}`);

  // Linked work: the same linkage traceDecision uses — items whose remote links
  // point at the decision, plus items the decision names directly.
  const linkedMap = new Map<string, WorkItem>();
  for (const item of index.workByLinkedPageId.get(decision.ref.id) ?? []) {
    linkedMap.set(item.ref.id, item);
  }
  for (const wid of decision.linkedWorkItemIds ?? []) {
    const item = index.workById.get(wid);
    if (item) linkedMap.set(item.ref.id, item);
  }
  const linked = [...linkedMap.values()].sort(byRefId);
  const openLinked = linked.filter((w) => w.status === 'open');

  const areas: ImpactArea[] = [];

  // Open linked work first, in canonical order.
  for (const item of openLinked) {
    areas.push({
      kind: 'outdated-work',
      title: `${item.ref.title} may no longer match the intent`,
      detail:
        `This open issue is linked to "${decision.ref.title}". If the decision is superseded or reversed, ` +
        `the work must be reviewed against the new decision.`,
      confidence: 'high',
      evidence: [decision.ref, item.ref],
      suggestedActions: ['Review the work against the new decision', 'Update or close it if it is no longer valid'],
    });
  }

  // Open changes implementing that work, deduplicated by pr id.
  const seenPrs = new Set<string>();
  for (const item of openLinked) {
    for (const prId of [...new Set(item.linkedPullRequestIds ?? [])].sort()) {
      const pr = index.pullRequestsById.get(prId);
      if (!pr || pr.state !== 'open' || seenPrs.has(prId)) continue;
      seenPrs.add(prId);
      areas.push({
        kind: 'outdated-change',
        title: pr.ref.title,
        detail:
          `This open pull request implements ${item.ref.title}, which is linked to "${decision.ref.title}". ` +
          `If the decision changes, the change may implement the wrong intent.`,
        confidence: 'medium',
        evidence: [decision.ref, item.ref, pr.ref],
        suggestedActions: ['Re-review the change against the new decision', 'Close it if the intent is no longer current'],
      });
    }
  }

  // Who needs to know, through records only.
  const roles = new RoleBook();
  roles.add(decision.ownerId, 'owns this decision');
  for (const id of decision.pendingApproverIds) roles.add(id, 'is still approving this decision');
  for (const item of openLinked) {
    roles.add(item.assigneeId, 'holds open work linked to this decision');
    for (const prId of [...new Set(item.linkedPullRequestIds ?? [])].sort()) {
      const pr = index.pullRequestsById.get(prId);
      if (pr?.state === 'open') roles.add(pr.authorId, 'authored an open change linked to this decision');
    }
  }

  const counts: DecisionImpactCounts = {
    outdatedWork: areas.filter((a) => a.kind === 'outdated-work').length,
    outdatedChanges: areas.filter((a) => a.kind === 'outdated-change').length,
  };

  return {
    decision: decision.ref,
    status: decision.status,
    areas,
    counts,
    people: roles.people(graph),
    caveats: DECISION_IMPACT_CAVEATS,
  };
}
