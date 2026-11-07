import { useEffect, useMemo } from 'react';
import { rankPeopleByRisk } from '@traceflow/core';
import type { OrgGraph } from '@traceflow/core';
import { Caveats } from '../components/Caveats';
import { EmptyState } from '../components/States';
import { EvidencePanel } from '../components/Evidence';
import { findingId, toEvidence } from '../components/evidence-model';
import { GraphGate } from '../components/Gate';
import { Ledger } from '../components/Ledger';
import { go, hrefFor, useRoute } from '../router';

const LEVEL_LABEL = { low: 'Low', medium: 'Medium', high: 'High' } as const;

export function PeopleView() {
  return <GraphGate label="Loading people">{(graph) => <PeopleReady graph={graph} />}</GraphGate>;
}

function PeopleReady({ graph }: { graph: OrgGraph }) {
  const route = useRoute();
  const ranked = useMemo(() => rankPeopleByRisk(graph), [graph]);

  useEffect(() => {
    const first = ranked[0];
    if (!route.id && first) go({ view: 'people', id: first.personId }, true);
  }, [route.id, ranked]);

  if (ranked.length === 0) {
    return (
      <div className="workspace workspace-single">
        <EmptyState title="No people yet">
          Connect a Jira or Confluence site and TraceFlow will list everyone with recorded work here.
        </EmptyState>
      </div>
    );
  }

  const current = ranked.find((r) => r.personId === route.id);
  const selectedIndex = current?.findings.findIndex((f, i) => findingId(f, i) === route.finding) ?? -1;
  const selected = current && selectedIndex >= 0 ? current.findings[selectedIndex] : undefined;

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
                    href={hrefFor({ view: 'people', id: r.personId })}
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

      <section className="main" aria-label="Person investigation">
        {!current ? (
          <EmptyState title="Person not found">Pick someone from the list.</EmptyState>
        ) : (
          <>
            <header className="page-head">
              <h1 id="person-heading">{current.personName}</h1>
              <p className="lead">What would be left without a clear owner if {current.personName} became unavailable.</p>
              <p className="verdict">
                <span className="verdict-figure figure">{current.score}</span>
                <span className="verdict-of">of 100</span>
                <span className="verdict-level">{LEVEL_LABEL[current.level]} risk</span>
              </p>
            </header>

            <h2 className="section-title">Handover ledger</h2>
            <Ledger
              report={current}
              selectedId={route.finding}
              onSelect={(id) =>
                go({ view: 'people', id: current.personId, finding: route.finding === id ? undefined : id })
              }
            />
            <Caveats items={current.caveats} />
          </>
        )}
      </section>

      <EvidencePanel item={selected ? toEvidence(selected) : undefined} />
    </div>
  );
}
