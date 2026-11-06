import { useEffect, useMemo } from 'react';
import { traceDecision } from '@traceflow/core';
import type { OrgGraph } from '@traceflow/core';
import { Caveats } from '../components/Caveats';
import { EmptyState } from '../components/States';
import { EvidencePanel } from '../components/Evidence';
import { findingId, toEvidence } from '../components/evidence-model';
import { FindingList } from '../components/FindingList';
import { GraphGate } from '../components/Gate';
import { go, hrefFor, useRoute } from '../router';

export function DecisionsView() {
  return <GraphGate label="Loading decisions">{(graph) => <DecisionsReady graph={graph} />}</GraphGate>;
}

function DecisionsReady({ graph }: { graph: OrgGraph }) {
  const route = useRoute();
  const reports = useMemo(() => graph.decisions.map((d) => traceDecision(graph, d.ref.id)), [graph]);

  useEffect(() => {
    const first = reports[0];
    if (!route.id && first) go({ view: 'decisions', id: first.decision.id }, true);
  }, [route.id, reports]);

  if (reports.length === 0) {
    return (
      <div className="workspace workspace-single">
        <EmptyState title="No decisions yet">
          Decision pages from Confluence appear here once they are linked to Jira work.
        </EmptyState>
      </div>
    );
  }

  const report = reports.find((r) => r.decision.id === route.id);
  const selectedIndex = report?.findings.findIndex((f, i) => findingId(f, i) === route.finding) ?? -1;
  const selected = report && selectedIndex >= 0 ? report.findings[selectedIndex] : undefined;
  const workById = new Map(graph.workItems.map((w) => [w.ref.id, w]));

  return (
    <div className="workspace">
      <nav className="rail" aria-label="Decisions">
        <h2 className="rail-title">Decisions</h2>
        <table className="rank">
          <thead>
            <tr>
              <th scope="col">Decision</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.decision.id}>
                <td>
                  <a
                    href={hrefFor({ view: 'decisions', id: r.decision.id })}
                    aria-current={r.decision.id === route.id ? 'page' : undefined}
                  >
                    {r.decision.title.replace(/^Decision:\s*/, '')}
                  </a>
                </td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </nav>

      <section className="main" aria-labelledby="decision-heading">
        {!report ? (
          <EmptyState title="Decision not found">Pick a decision from the list.</EmptyState>
        ) : (
          <>
            <header className="page-head">
              <h1 id="decision-heading">{report.decision.title.replace(/^Decision:\s*/, '')}</h1>
              <p className="lead">Status: {report.status}. What it drives and who it touches.</p>
            </header>

            <h2 className="section-title">Linked work</h2>
            {report.linkedWork.length === 0 ? (
              <p className="muted">No work items link to this decision.</p>
            ) : (
              <table className="plain">
                <thead>
                  <tr>
                    <th scope="col">Issue</th>
                    <th scope="col">Title</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.linkedWork.map((w) => (
                    <tr key={w.id}>
                      <td className="figure">{w.id}</td>
                      <td>{w.title}</td>
                      <td>{workById.get(w.id)?.status ?? 'unknown'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2 className="section-title">People involved</h2>
            <table className="plain">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                </tr>
              </thead>
              <tbody>
                {report.people.map(({ person, roles }) => (
                  <tr key={person.id}>
                    <td>{person.name}</td>
                    <td>{roles.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="section-title">Findings</h2>
            <FindingList
              label="Findings"
              findings={report.findings}
              selectedId={route.finding}
              onSelect={(id) =>
                go({ view: 'decisions', id: report.decision.id, finding: route.finding === id ? undefined : id })
              }
              emptyText="No findings. This decision is approved and its work lines up."
            />
            <Caveats items={report.caveats} />
          </>
        )}
      </section>

      <EvidencePanel item={selected ? toEvidence(selected) : undefined} />
    </div>
  );
}
