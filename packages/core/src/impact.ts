import type { Confidence, OrgGraph, RecordRef, WorkItem } from './types.js';

/** What kind of thing loses an owner when the person becomes unavailable. */
export type ImpactAreaKind =
  | 'stalled-epic'
  | 'stalled-work'
  | 'orphaned-page'
  | 'blocked-decision'
  | 'unmerged-change';

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
  const byEpic = new Map<string, WorkItem[]>();
  for (const item of graph.workItems) {
    if (item.type === 'epic' || !item.epicId) continue; // containers handled separately
    if (item.assigneeId !== personId || item.status !== 'open') continue;
    const bucket = byEpic.get(item.epicId);
    if (bucket) bucket.push(item);
    else byEpic.set(item.epicId, [item]);
  }
  const result: ImpactedEpic[] = [];
  for (const epic of graph.workItems) {
    if (epic.type !== 'epic') continue;
    const items = byEpic.get(epic.ref.id) ?? [];
    const ownsEpic = epic.assigneeId === personId && epic.status === 'open';
    if (items.length > 0 || ownsEpic) result.push({ epic, items, ownsEpic });
  }
  return result;
}

/** Open, non-epic items assigned to the person that sit in no epic at all. */
function loneWork(graph: OrgGraph, personId: string): WorkItem[] {
  return graph.workItems.filter(
    (w) => w.type !== 'epic' && !w.epicId && w.assigneeId === personId && w.status === 'open',
  );
}

/**
 * What breaks if this person becomes unavailable: every epic, page, decision and
 * pull request the connected records tie to them alone. Deterministic.
 */
export function personImpact(graph: OrgGraph, personId: string): PersonImpactReport {
  const person = graph.people.find((p) => p.id === personId);
  if (!person) throw new Error(`Unknown person: ${personId}`);

  const areas: ImpactArea[] = [];

  // Stalled epics first, in stable epic order.
  for (const { epic, items, ownsEpic } of impactedEpics(graph, personId)) {
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
