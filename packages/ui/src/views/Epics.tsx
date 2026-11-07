import { useEffect, useMemo } from 'react';
import { traceEpic } from '@traceflow/core';
import type { LineageReport, OrgGraph } from '@traceflow/core';
import { Caveats } from '../components/Caveats';
import { EmptyState } from '../components/States';
import { EvidencePanel } from '../components/Evidence';
import type { EvidenceItem } from '../components/Evidence';
import { findingId, toEvidence } from '../components/evidence-model';
import { FindingList } from '../components/FindingList';
import { GraphGate } from '../components/Gate';
import { Lanes, nodeKind } from '../components/Lanes';
import { go, hrefFor, useRoute } from '../router';

const NODE_PREFIX = 'node-';

export function EpicsView() {
  return <GraphGate label="Loading epics">{(graph) => <EpicsReady graph={graph} />}</GraphGate>;
}

function describeNode(report: LineageReport, nodeId: string): EvidenceItem | undefined {
  const node = report.nodes.find((n) => n.id === nodeId);
  if (!node) return undefined;
  const byId = new Map(report.nodes.map((n) => [n.id, n]));
  const relations = report.edges.flatMap((e) => {
    if (e.from === nodeId) {
      const other = byId.get(e.to);
      return other ? [{ text: `${e.kind === 'specifies' ? 'Specifies' : e.kind === 'contains' ? 'Contains' : 'Implements'} ${other.ref.title}`, ref: other.ref }] : [];
    }
    if (e.to === nodeId) {
      const other = byId.get(e.from);
      return other ? [{ text: `${e.kind === 'specifies' ? 'Specified by' : e.kind === 'contains' ? 'Part of' : 'Implemented by'} ${other.ref.title}`, ref: other.ref }] : [];
    }
    return [];
  });
  return {
    title: node.ref.title,
    detail: `${nodeKind(node)}${node.status ? `, ${node.status}` : ''}. ${relations.length} recorded link${relations.length === 1 ? '' : 's'} in this epic.`,
    records: [node.ref, ...relations.map((r) => r.ref)],
    actions: [],
  };
}

function EpicsReady({ graph }: { graph: OrgGraph }) {
  const route = useRoute();
  const epics = useMemo(
    () =>
      graph.workItems
        .filter((w) => w.type === 'epic')
        .map((w) => ({ item: w, report: traceEpic(graph, w.ref.id) })),
    [graph],
  );

  useEffect(() => {
    const first = epics[0];
    if (!route.id && first) go({ view: 'epics', id: first.item.ref.id }, true);
  }, [route.id, epics]);

  if (epics.length === 0) {
    return (
      <div className="workspace workspace-single">
        <EmptyState title="No epics yet">
          Epics from Jira appear here once they have child issues or linked pages.
        </EmptyState>
      </div>
    );
  }

  const current = epics.find((e) => e.item.ref.id === route.id);
  const report = current?.report;
  const isNode = route.finding?.startsWith(NODE_PREFIX);
  const gapIndex = report && route.finding && !isNode ? report.gaps.findIndex((g, i) => findingId(g, i) === route.finding) : -1;
  const evidence: EvidenceItem | undefined = !report
    ? undefined
    : isNode
      ? describeNode(report, route.finding!.slice(NODE_PREFIX.length))
      : gapIndex >= 0
        ? toEvidence(report.gaps[gapIndex]!)
        : undefined;

  const select = (finding?: string) => report && go({ view: 'epics', id: report.epic.id, finding });

  return (
    <div className="workspace">
      <nav className="rail" aria-label="Epics">
        <h2 className="rail-title">Epics</h2>
        <table className="rank">
          <thead>
            <tr>
              <th scope="col">Epic</th>
              <th scope="col" className="num">Gaps</th>
            </tr>
          </thead>
          <tbody>
            {epics.map(({ item, report: r }) => (
              <tr key={item.ref.id}>
                <td>
                  <a
                    href={hrefFor({ view: 'epics', id: item.ref.id })}
                    aria-current={item.ref.id === route.id ? 'page' : undefined}
                  >
                    <span className="figure key">{item.ref.id}</span> {item.ref.title}
                  </a>
                </td>
                <td className="num">{r.gaps.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </nav>

      <section className="main" aria-labelledby="epic-heading">
        {!report ? (
          <EmptyState title="Epic not found">Pick an epic from the list.</EmptyState>
        ) : (
          <>
            <header className="page-head">
              <h1 id="epic-heading">{report.epic.title}</h1>
              <p className="lead">From the recorded intent to the work and code that followed it.</p>
            </header>

            <Lanes
              report={report}
              selectedId={isNode ? route.finding!.slice(NODE_PREFIX.length) : undefined}
              onSelect={(nodeId) => {
                const next = `${NODE_PREFIX}${nodeId}`;
                select(route.finding === next ? undefined : next);
              }}
            />

            <h2 className="section-title">Gaps in the recorded links</h2>
            <FindingList
              label="Gaps"
              findings={report.gaps}
              selectedId={isNode ? undefined : route.finding}
              onSelect={(id) => select(route.finding === id ? undefined : id)}
              emptyText="No gaps found. Every check the connected data supports came back clean."
            />
            <Caveats items={report.caveats} />
          </>
        )}
      </section>

      <EvidencePanel item={evidence} />
    </div>
  );
}
