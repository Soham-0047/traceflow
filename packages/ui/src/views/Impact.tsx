import { useEffect, useMemo } from 'react';
import { personImpact, rankPeopleByRisk } from '@traceflow/core';
import type { ImpactArea, ImpactAreaKind, OrgGraph } from '@traceflow/core';
import { Caveats } from '../components/Caveats';
import { EmptyState } from '../components/States';
import { EvidencePanel } from '../components/Evidence';
import { areaId, areaToEvidence } from '../components/evidence-model';
import { GraphGate } from '../components/Gate';
import { go, hrefFor, useRoute } from '../router';

/** Sections in display order; each is one kind of blast radius. */
const SECTIONS: { kind: ImpactAreaKind; title: string; noun: string }[] = [
  { kind: 'stalled-epic', title: 'Stalled epics', noun: 'epics' },
  { kind: 'stalled-work', title: 'Work outside any epic', noun: 'issues' },
  { kind: 'orphaned-page', title: 'Orphaned knowledge', noun: 'pages' },
  { kind: 'blocked-decision', title: 'Blocked decisions', noun: 'decisions' },
  { kind: 'unmerged-change', title: 'Unmerged changes', noun: 'pull requests' },
];

export function ImpactView() {
  return <GraphGate label="Loading impact">{(graph) => <ImpactReady graph={graph} />}</GraphGate>;
}

function ImpactReady({ graph }: { graph: OrgGraph }) {
  const route = useRoute();
  const ranked = useMemo(() => rankPeopleByRisk(graph), [graph]);

  useEffect(() => {
    const first = ranked[0];
    if (!route.id && first) go({ view: 'impact', id: first.personId }, true);
  }, [route.id, ranked]);

  const current = ranked.find((r) => r.personId === route.id);
  const report = useMemo(
    () => (current ? personImpact(graph, current.personId) : null),
    [graph, current],
  );

  if (ranked.length === 0) {
    return (
      <div className="workspace workspace-single">
        <EmptyState title="No people yet">
          Connect a Jira or Confluence site and TraceFlow will show what would be left without each person.
        </EmptyState>
      </div>
    );
  }

  const selected =
    report && route.finding
      ? report.areas.find((a, i) => areaId(a, i) === route.finding)
      : undefined;

  return (
    <div className="workspace">
      <section className="rail" aria-label="People ranked by knowledge risk">
        <h2 className="rail-title">People</h2>
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
      </section>

      <section className="main" aria-label="Change impact">
        {!current || !report ? (
          <EmptyState title="Person not found">Pick someone from the list.</EmptyState>
        ) : (
          <>
            <header className="page-head">
              <h1 id="impact-heading">{current.personName}: what is left behind</h1>
              <p className="lead">
                Everything the connected records tie to {current.personName} alone, grouped by what kind of
                thing loses an owner. Select a row to see its evidence.
              </p>
              <p className="verdict impact-verdict">
                {SECTIONS.map((s) => {
                  const count = report.areas.filter((a) => a.kind === s.kind).length;
                  return (
                    <span className="impact-count" key={s.kind}>
                      <span className="verdict-figure figure">{count}</span>
                      <span className="verdict-of">{s.noun}</span>
                    </span>
                  );
                })}
              </p>
            </header>

            {report.areas.length === 0 ? (
              <p className="muted">
                Nothing in the connected records depends on {current.personName} alone. A change that
                removes them would not stall any recorded work.
              </p>
            ) : (
              SECTIONS.map((section) => {
                const areas = report.areas
                  .map((area, index) => ({ area, index }))
                  .filter(({ area }) => area.kind === section.kind);
                if (areas.length === 0) return null;
                return (
                  <div key={section.kind} className="impact-section">
                    <h2 className="section-title">{section.title}</h2>
                    <ul className="impact-list">
                      {areas.map(({ area, index }) => (
                        <ImpactRow
                          key={areaId(area, index)}
                          area={area}
                          selected={areaId(area, index) === route.finding}
                          onSelect={() =>
                            go({
                              view: 'impact',
                              id: current.personId,
                              finding: route.finding === areaId(area, index) ? undefined : areaId(area, index),
                            })
                          }
                        />
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
            <Caveats items={report.caveats} />
          </>
        )}
      </section>

      <EvidencePanel item={selected ? areaToEvidence(selected) : undefined} />
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
