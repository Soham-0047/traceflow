import { useEffect, useMemo } from 'react';
import {
  personImpact,
  epicImpact,
  decisionImpact,
  rankPeopleByRisk,
  buildOverview,
} from '@traceflow/core';
import type { ImpactArea, ImpactAreaKind, ImpactPerson, OrgGraph } from '@traceflow/core';
import { Caveats } from '../components/Caveats';
import { EmptyState } from '../components/States';
import { EvidencePanel } from '../components/Evidence';
import { FindingList } from '../components/FindingList';
import { areaId, areaToEvidence, findingId, toEvidence } from '../components/evidence-model';
import { GraphGate } from '../components/Gate';
import { go, hrefFor, useRoute } from '../router';
import type { ImpactKind, Route } from '../router';

/** Sections in display order; each is one kind of blast radius. */
const PERSON_SECTIONS: { kind: ImpactAreaKind; title: string; noun: string }[] = [
  { kind: 'stalled-epic', title: 'Stalled epics', noun: 'epics' },
  { kind: 'stalled-work', title: 'Work outside any epic', noun: 'issues' },
  { kind: 'orphaned-page', title: 'Orphaned knowledge', noun: 'pages' },
  { kind: 'blocked-decision', title: 'Blocked decisions', noun: 'decisions' },
  { kind: 'unmerged-change', title: 'Unmerged changes', noun: 'pull requests' },
];
const EPIC_SECTIONS: { kind: ImpactAreaKind; title: string; noun: string }[] = [
  { kind: 'orphaned-work', title: 'Work that loses its plan', noun: 'issues' },
  { kind: 'stale-spec', title: 'Records to re-check', noun: 'records' },
  { kind: 'unreviewed-change', title: 'Unreviewed changes', noun: 'pull requests' },
];
const DECISION_SECTIONS: { kind: ImpactAreaKind; title: string; noun: string }[] = [
  { kind: 'outdated-work', title: 'Work to review against the new decision', noun: 'issues' },
  { kind: 'outdated-change', title: 'Changes that may carry the wrong intent', noun: 'pull requests' },
];

type Subject = 'person' | 'epic' | 'decision';

const SUBJECT_TABS: { subject: Subject; label: string }[] = [
  { subject: 'person', label: 'People' },
  { subject: 'epic', label: 'Epics' },
  { subject: 'decision', label: 'Decisions' },
];

export function ImpactView() {
  return <GraphGate label="Loading impact">{(graph) => <ImpactReady graph={graph} />}</GraphGate>;
}

function ImpactReady({ graph }: { graph: OrgGraph }) {
  const route = useRoute();
  const subject: Subject = route.kind ?? 'person';

  const ranked = useMemo(() => rankPeopleByRisk(graph), [graph]);
  const epics = useMemo(() => buildOverview(graph).epics, [graph]);
  const decisions = useMemo(
    () => [...graph.decisions].sort((a, b) => a.ref.id.localeCompare(b.ref.id)),
    [graph],
  );

  // Auto-select the first subject of the active kind, so every tab has a
  // default investigation the way the people tab always did.
  useEffect(() => {
    if (route.id) return;
    if (subject === 'person' && ranked[0]) go({ view: 'impact', id: ranked[0].personId }, true);
    if (subject === 'epic' && epics[0]) go({ view: 'impact', kind: 'epic', id: epics[0].epic.id }, true);
    if (subject === 'decision' && decisions[0]) go({ view: 'impact', kind: 'decision', id: decisions[0].ref.id }, true);
  }, [route.id, subject, ranked, epics, decisions]);

  const emptyCopy: Record<Subject, { title: string; body: string }> = {
    person: {
      title: 'No people yet',
      body: 'Connect a Jira or Confluence site and TraceFlow will show what would be left without each person.',
    },
    epic: {
      title: 'No epics yet',
      body: 'Epics from Jira appear here once work is linked to them, and TraceFlow will show what a change to each would affect.',
    },
    decision: {
      title: 'No decisions yet',
      body: 'Decision records from Confluence appear here once they are linked to Jira work, and TraceFlow will show what a change to each would touch.',
    },
  };
  const subjectsOf = (kind: Subject): number =>
    kind === 'person' ? ranked.length : kind === 'epic' ? epics.length : decisions.length;

  if (subjectsOf(subject) === 0) {
    return (
      <div className="workspace workspace-single">
        <EmptyState title={emptyCopy[subject].title}>{emptyCopy[subject].body}</EmptyState>
      </div>
    );
  }

  return (
    <div className="workspace">
      <section className="rail" aria-label={railLabel(subject)}>
        <h2 className="rail-title">Impact of a change</h2>
        <nav className="impact-tabs" aria-label="Impact subject">
          <ul>
            {SUBJECT_TABS.map((tab) => (
              <li key={tab.subject}>
                <a
                  href={hrefFor(tab.subject === 'person' ? { view: 'impact' } : { view: 'impact', kind: tab.subject as ImpactKind })}
                  aria-current={tab.subject === subject ? 'page' : undefined}
                >
                  {tab.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {subject === 'person' ? <PersonRail ranked={ranked} route={route} /> : null}
        {subject === 'epic' ? <EpicRail epics={epics} route={route} /> : null}
        {subject === 'decision' ? <DecisionRail decisions={decisions} route={route} /> : null}
      </section>

      <section className="main" aria-label="Change impact">
        {subject === 'person' ? <PersonMain graph={graph} route={route} ranked={ranked} /> : null}
        {subject === 'epic' ? <EpicMain graph={graph} route={route} epics={epics} /> : null}
        {subject === 'decision' ? <DecisionMain graph={graph} route={route} decisions={decisions} /> : null}
      </section>

      {subject === 'person' ? <PersonEvidence graph={graph} route={route} ranked={ranked} /> : null}
      {subject === 'epic' ? <EpicEvidence graph={graph} route={route} epics={epics} /> : null}
      {subject === 'decision' ? <DecisionEvidence graph={graph} route={route} decisions={decisions} /> : null}
    </div>
  );
}

function railLabel(subject: Subject): string {
  if (subject === 'person') return 'People ranked by knowledge risk';
  if (subject === 'epic') return 'Epics ranked by recorded gaps';
  return 'Decisions';
}

/* ------------------------------------------------------------------ *
 * Rails
 * ------------------------------------------------------------------ */

function PersonRail({ ranked, route }: { ranked: ReturnType<typeof rankPeopleByRisk>; route: Route }) {
  return (
    <table className="rank">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col" className="num">Score</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((r) => (
          <tr key={r.personId}>
            <td>
              <a
                href={hrefFor({ view: 'impact', id: r.personId })}
                aria-current={r.personId === route.id ? 'page' : undefined}
              >
                {r.personName}
              </a>
            </td>
            <td className="num">{r.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EpicRail({ epics, route }: { epics: ReturnType<typeof buildOverview>['epics']; route: Route }) {
  return (
    <table className="rank">
      <thead>
        <tr>
          <th scope="col">Epic</th>
          <th scope="col" className="num">Gaps</th>
        </tr>
      </thead>
      <tbody>
        {epics.map((e) => (
          <tr key={e.epic.id}>
            <td>
              <a
                href={hrefFor({ view: 'impact', kind: 'epic', id: e.epic.id })}
                aria-current={e.epic.id === route.id ? 'page' : undefined}
              >
                <span className="key">{e.epic.id}</span> {e.epic.title}
              </a>
            </td>
            <td className="num">{e.gaps}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DecisionRail({
  decisions,
  route,
}: {
  decisions: OrgGraph['decisions'];
  route: Route;
}) {
  return (
    <table className="rank">
      <thead>
        <tr>
          <th scope="col">Decision</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {decisions.map((d) => (
          <tr key={d.ref.id}>
            <td>
              <a
                href={hrefFor({ view: 'impact', kind: 'decision', id: d.ref.id })}
                aria-current={d.ref.id === route.id ? 'page' : undefined}
              >
                {d.ref.title.replace(/^Decision:\s*/, '')}
              </a>
            </td>
            <td>{d.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ *
 * Main panels
 * ------------------------------------------------------------------ */

function PersonMain({
  graph,
  route,
  ranked,
}: {
  graph: OrgGraph;
  route: Route;
  ranked: ReturnType<typeof rankPeopleByRisk>;
}) {
  const current = ranked.find((r) => r.personId === route.id);
  const report = useMemo(
    () => (current ? personImpact(graph, current.personId) : null),
    [graph, current],
  );

  if (!current || !report) {
    return <EmptyState title="Person not found">Pick someone from the list.</EmptyState>;
  }

  return (
    <>
      <header className="page-head">
        <h1 id="impact-heading">{current.personName}: what is left behind</h1>
        <p className="lead">
          Everything the connected records tie to {current.personName} alone, grouped by what kind of
          thing loses an owner. Select a row to see its evidence.
        </p>
        <Verdict sections={PERSON_SECTIONS} areas={report.areas} />
      </header>
      {report.areas.length === 0 ? (
        <p className="muted">
          Nothing in the connected records depends on {current.personName} alone. A change that
          removes them would not stall any recorded work.
        </p>
      ) : (
        <ImpactSections
          sections={PERSON_SECTIONS}
          areas={report.areas}
          route={route}
          goFinding={(finding) =>
            go({ view: 'impact', id: current.personId, finding: route.finding === finding ? undefined : finding })
          }
        />
      )}
      <Caveats items={report.caveats} />
    </>
  );
}

function EpicMain({
  graph,
  route,
  epics,
}: {
  graph: OrgGraph;
  route: Route;
  epics: ReturnType<typeof buildOverview>['epics'];
}) {
  const epic = epics.find((e) => e.epic.id === route.id);
  const report = useMemo(() => (epic ? epicImpact(graph, epic.epic.id) : null), [graph, epic]);

  if (!epic || !report) {
    return <EmptyState title="Epic not found">Pick an epic from the list.</EmptyState>;
  }

  return (
    <>
      <header className="page-head">
        <h1 id="impact-heading">
          {report.epic.title} ({report.epic.id}): what a change affects
        </h1>
        <p className="lead">
          Everything the connected records tie to this epic, grouped by what a scope change or
          cancellation would affect. Select a row to see its evidence.
        </p>
        <Verdict sections={EPIC_SECTIONS} areas={report.areas} />
      </header>
      {report.areas.length === 0 ? (
        <p className="muted">
          Nothing in the connected records is tied to this epic: no open work, linked specifications
          or open changes would be affected by a change to it.
        </p>
      ) : (
        <ImpactSections
          sections={EPIC_SECTIONS}
          areas={report.areas}
          route={route}
          goFinding={(finding) =>
            go({
              view: 'impact',
              kind: 'epic',
              id: epic.epic.id,
              finding: route.finding === finding ? undefined : finding,
            })
          }
        />
      )}
      <div className="impact-section">
        <h2 className="section-title">Already recorded gaps</h2>
        <p className="muted">
          These lineage gaps exist before any change; a change to the epic makes closing them more urgent.
        </p>
        <FindingList
          label="Recorded gaps"
          findings={report.gaps}
          selectedId={route.finding}
          onSelect={(id) =>
            go({
              view: 'impact',
              kind: 'epic',
              id: epic.epic.id,
              finding: route.finding === id ? undefined : id,
            })
          }
          emptyText="No gaps were found in this epic's recorded links."
        />
      </div>
      <WhoNeedsToKnow people={report.people} />
      <Caveats items={report.caveats} />
    </>
  );
}

function DecisionMain({
  graph,
  route,
  decisions,
}: {
  graph: OrgGraph;
  route: Route;
  decisions: OrgGraph['decisions'];
}) {
  const decision = decisions.find((d) => d.ref.id === route.id);
  const report = useMemo(
    () => (decision ? decisionImpact(graph, decision.ref.id) : null),
    [graph, decision],
  );

  if (!decision || !report) {
    return <EmptyState title="Decision not found">Pick a decision from the list.</EmptyState>;
  }

  return (
    <>
      <header className="page-head">
        <h1 id="impact-heading">
          {report.decision.title.replace(/^Decision:\s*/, '')}: what a change affects
        </h1>
        <p className="lead">
          Status: {report.status}. Everything the connected records tie to this decision; a
          supersession or reversal would touch the work and changes below. Select a row to see its
          evidence.
        </p>
        <Verdict sections={DECISION_SECTIONS} areas={report.areas} />
      </header>
      {report.areas.length === 0 ? (
        <p className="muted">
          Nothing in the connected records is tied to this decision: no open work or open changes
          implement it.
        </p>
      ) : (
        <ImpactSections
          sections={DECISION_SECTIONS}
          areas={report.areas}
          route={route}
          goFinding={(finding) =>
            go({
              view: 'impact',
              kind: 'decision',
              id: decision.ref.id,
              finding: route.finding === finding ? undefined : finding,
            })
          }
        />
      )}
      <WhoNeedsToKnow people={report.people} />
      <Caveats items={report.caveats} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

function Verdict({
  sections,
  areas,
}: {
  sections: { kind: ImpactAreaKind; title: string; noun: string }[];
  areas: ImpactArea[];
}) {
  return (
    <p className="verdict impact-verdict">
      {sections.map((s) => {
        const count = areas.filter((a) => a.kind === s.kind).length;
        return (
          <span className="impact-count" key={s.kind}>
            <span className="verdict-figure figure">{count}</span>
            <span className="verdict-of">{s.noun}</span>
          </span>
        );
      })}
    </p>
  );
}

function ImpactSections({
  sections,
  areas,
  route,
  goFinding,
}: {
  sections: { kind: ImpactAreaKind; title: string; noun: string }[];
  areas: ImpactArea[];
  route: Route;
  goFinding: (finding: string) => void;
}) {
  return (
    <>
      {sections.map((section) => {
        const rows = areas
          .map((area, index) => ({ area, index }))
          .filter(({ area }) => area.kind === section.kind);
        if (rows.length === 0) return null;
        return (
          <div key={section.kind} className="impact-section">
            <h2 className="section-title">{section.title}</h2>
            <ul className="impact-list">
              {rows.map(({ area, index }) => (
                <ImpactRow
                  key={areaId(area, index)}
                  area={area}
                  selected={areaId(area, index) === route.finding}
                  onSelect={() => goFinding(areaId(area, index))}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function WhoNeedsToKnow({ people }: { people: ImpactPerson[] }) {
  return (
    <div className="impact-section">
      <h2 className="section-title">Who needs to know</h2>
      {people.length === 0 ? (
        <p className="muted">No person is tied to this through the connected records.</p>
      ) : (
        <table className="plain">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Why they are tied</th>
            </tr>
          </thead>
          <tbody>
            {people.map(({ person, roles }) => (
              <tr key={person.id}>
                <td>{person.name}</td>
                <td>{roles.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ImpactRow({
  area,
  selected,
  onSelect,
}: {
  area: ImpactArea;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li className="impact-item" data-selected={selected}>
      <button type="button" className="row-button impact-button" aria-current={selected ? 'true' : undefined} onClick={onSelect}>
        <span>{area.title}</span>
        <span className="impact-records">{area.evidence.length} record(s)</span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Evidence drawers (one per subject kind, sharing the same panel)
 * ------------------------------------------------------------------ */

function PersonEvidence({
  graph,
  route,
  ranked,
}: {
  graph: OrgGraph;
  route: Route;
  ranked: ReturnType<typeof rankPeopleByRisk>;
}) {
  const current = ranked.find((r) => r.personId === route.id);
  const report = useMemo(
    () => (current ? personImpact(graph, current.personId) : null),
    [graph, current],
  );
  const selected = report
    ? report.areas.find((a, i) => areaId(a, i) === route.finding)
    : undefined;
  return <EvidencePanel item={selected ? areaToEvidence(selected) : undefined} />;
}

function EpicEvidence({
  graph,
  route,
  epics,
}: {
  graph: OrgGraph;
  route: Route;
  epics: ReturnType<typeof buildOverview>['epics'];
}) {
  const epic = epics.find((e) => e.epic.id === route.id);
  const report = useMemo(() => (epic ? epicImpact(graph, epic.epic.id) : null), [graph, epic]);
  const area = report?.areas.find((a, i) => areaId(a, i) === route.finding);
  const gap = report && !area ? report.gaps.find((g, i) => findingId(g, i) === route.finding) : undefined;
  return (
    <EvidencePanel
      item={area ? areaToEvidence(area) : gap ? toEvidence(gap) : undefined}
    />
  );
}

function DecisionEvidence({
  graph,
  route,
  decisions,
}: {
  graph: OrgGraph;
  route: Route;
  decisions: OrgGraph['decisions'];
}) {
  const decision = decisions.find((d) => d.ref.id === route.id);
  const report = useMemo(
    () => (decision ? decisionImpact(graph, decision.ref.id) : null),
    [graph, decision],
  );
  const selected = report
    ? report.areas.find((a, i) => areaId(a, i) === route.finding)
    : undefined;
  return <EvidencePanel item={selected ? areaToEvidence(selected) : undefined} />;
}
