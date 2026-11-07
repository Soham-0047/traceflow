import { useMemo } from 'react';
import { buildOverview, OVERVIEW_TOP_PEOPLE } from '@traceflow/core';
import type { OrgGraph } from '@traceflow/core';
import { Caveats } from '../components/Caveats';
import { EmptyState } from '../components/States';
import { GraphGate } from '../components/Gate';
import { hrefFor } from '../router';

const LEVEL_LABEL = { low: 'Low', medium: 'Medium', high: 'High' } as const;

export function OverviewView() {
  return <GraphGate label="Loading the overview">{(graph) => <OverviewReady graph={graph} />}</GraphGate>;
}

function OverviewReady({ graph }: { graph: OrgGraph }) {
  const report = useMemo(() => buildOverview(graph), [graph]);
  const { counts, topPeople, epics } = report;

  if (counts.people === 0 && counts.epics === 0) {
    return (
      <div className="workspace workspace-single">
        <EmptyState title="Nothing to investigate yet">
          Connect a Jira or Confluence site and TraceFlow will show the people, epics and decisions it finds there.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="workspace workspace-single">
      <div className="main">
        <header className="page-head">
          <h1>Organization overview</h1>
          <p className="lead">
            Where knowledge is concentrated and where recorded links have gaps, from the connected records.
          </p>
        </header>

        <h2 className="section-title">Top knowledge risks</h2>
        <table className="plain">
          <caption className="visually-hidden">
            The {Math.min(OVERVIEW_TOP_PEOPLE, topPeople.length)} highest knowledge-risk people, by score from the
            handover ledger
          </caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col" className="num">Score</th>
              <th scope="col">Risk</th>
            </tr>
          </thead>
          <tbody>
            {topPeople.map((p) => (
              <tr key={p.personId}>
                <td>
                  <a href={hrefFor({ view: 'people', id: p.personId })}>{p.personName}</a>
                </td>
                <td className="num">{p.score}</td>
                <td>{LEVEL_LABEL[p.level]} risk</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="table-foot">
          <a href={hrefFor({ view: 'people' })}>All people, ranked by risk</a>
        </p>

        <h2 className="section-title">Epics by gaps in the recorded links</h2>
        <table className="plain">
          <caption className="visually-hidden">Epics ranked by the number of gaps found in their recorded links</caption>
          <thead>
            <tr>
              <th scope="col">Epic</th>
              <th scope="col" className="num">Open work</th>
              <th scope="col" className="num">Gaps</th>
            </tr>
          </thead>
          <tbody>
            {epics.map((e) => (
              <tr key={e.epic.id}>
                <td>
                  <a href={hrefFor({ view: 'epics', id: e.epic.id })}>
                    <span className="figure key">{e.epic.id}</span> {e.epic.title}
                  </a>
                </td>
                <td className="num">{e.openWork}</td>
                <td className="num">{e.gaps}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="section-title">Records in view</h2>
        <table className="plain">
          <caption className="visually-hidden">
            What is counted, and where its records are listed. Every number is a count of records.
          </caption>
          <thead>
            <tr>
              <th scope="col">What is counted</th>
              <th scope="col" className="num">Count</th>
              <th scope="col">Where to check</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>People with recorded work</td>
              <td className="num">{counts.people}</td>
              <td><a href={hrefFor({ view: 'people' })}>People</a></td>
            </tr>
            <tr>
              <td>Epics</td>
              <td className="num">{counts.epics}</td>
              <td><a href={hrefFor({ view: 'epics' })}>Epics</a></td>
            </tr>
            <tr>
              <td>Open work items</td>
              <td className="num">{counts.openWorkItems}</td>
              <td><a href={hrefFor({ view: 'epics' })}>Epics</a></td>
            </tr>
            <tr>
              <td>Pages with a sole contributor</td>
              <td className="num">{counts.soleContributorPages}</td>
              <td><a href={hrefFor({ view: 'people' })}>People</a></td>
            </tr>
            <tr>
              <td>Decisions awaiting input</td>
              <td className="num">{counts.pendingDecisions}</td>
              <td><a href={hrefFor({ view: 'decisions' })}>Decisions</a></td>
            </tr>
            <tr>
              <td>Open pull requests</td>
              <td className="num">{counts.openPullRequests}</td>
              <td><a href={hrefFor({ view: 'people' })}>People</a></td>
            </tr>
          </tbody>
        </table>

        <Caveats items={report.caveats} />
      </div>
    </div>
  );
}
