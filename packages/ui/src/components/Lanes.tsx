import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Lane, LineageNode, LineageReport } from '@traceflow/core';

const LANES: { lane: Lane; label: string }[] = [
  { lane: 'intent', label: 'Intent' },
  { lane: 'plan', label: 'Plan' },
  { lane: 'work', label: 'Work' },
  { lane: 'code', label: 'Code' },
];

/** What kind of record a node is, in the words a person would use. */
export function nodeKind(node: LineageNode): string {
  if (node.ref.source === 'confluence') return node.status ? 'Decision' : 'Page';
  return node.ref.id;
}

interface EdgePath {
  key: string;
  d: string;
  from: string;
  to: string;
}

export function Lanes({
  report,
  selectedId,
  onSelect,
}: {
  report: LineageReport;
  selectedId?: string;
  onSelect: (nodeId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const [paths, setPaths] = useState<EdgePath[]>([]);

  const connected = useMemo(() => {
    if (!selectedId) return undefined;
    const ids = new Set([selectedId]);
    for (const e of report.edges) {
      if (e.from === selectedId) ids.add(e.to);
      if (e.to === selectedId) ids.add(e.from);
    }
    return ids;
  }, [report, selectedId]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const compute = () => {
      const box = root.getBoundingClientRect();

      // Edges per node side, so several links to one record can fan out along
      // its edge instead of all meeting at the same point.
      const rectOf = new Map<string, DOMRect>();
      for (const e of report.edges) {
        for (const id of [e.from, e.to]) {
          if (!rectOf.has(id)) {
            const el = nodeRefs.current.get(id);
            if (el) rectOf.set(id, el.getBoundingClientRect());
          }
        }
      }
      // Assign evenly spaced anchor points on each node edge, ordered top to
      // bottom by the y of the far end, so several links to one record fan out
      // instead of all meeting at the same point.
      const anchors = new Map<string, { x: number; y: number; i: number; n: number }>();
      const anchorsFor = (id: string, side: 'left' | 'right') => {
        const rect = rectOf.get(id);
        if (!rect) return;
        const edges = report.edges
          .filter((e) => (side === 'right' ? e.from === id : e.to === id))
          .sort((ea, eb) => {
            const farA = rectOf.get(side === 'right' ? ea.to : ea.from);
            const farB = rectOf.get(side === 'right' ? eb.to : eb.from);
            return (farA?.top ?? 0) - (farB?.top ?? 0);
          });
        const n = edges.length;
        const step = Math.min(16, n > 1 ? (rect.height - 10) / (n - 1) : 0);
        const x = side === 'right' ? rect.right - box.left : rect.left - box.left;
        edges.forEach((e, i) => {
          const y = rect.top + rect.height / 2 - box.top + (i - (n - 1) / 2) * step;
          anchors.set(`${e.from}|${e.to}|${side}`, { x, y, i, n });
        });
      };
      for (const id of rectOf.keys()) {
        anchorsFor(id, 'right');
        anchorsFor(id, 'left');
      }

      const next: EdgePath[] = [];
      for (const e of report.edges) {
        const a = nodeRefs.current.get(e.from);
        const b = nodeRefs.current.get(e.to);
        if (!a || !b) continue;
        const ar = rectOf.get(e.from)!;
        const br = rectOf.get(e.to)!;
        const forward = ar.left <= br.left;
        const start = anchors.get(`${e.from}|${e.to}|${forward ? 'right' : 'left'}`);
        const end = anchors.get(`${e.from}|${e.to}|${forward ? 'left' : 'right'}`);
        const left = forward
          ? { x: start?.x ?? ar.right - box.left, y: start?.y ?? ar.top + ar.height / 2 - box.top }
          : { x: end?.x ?? br.right - box.left, y: end?.y ?? br.top + br.height / 2 - box.top };
        const right = forward
          ? { x: end?.x ?? br.left - box.left, y: end?.y ?? br.top + br.height / 2 - box.top }
          : { x: start?.x ?? ar.left - box.left, y: start?.y ?? ar.top + ar.height / 2 - box.top };
        // Give each edge its own slice of the gutter (by its anchor order on the
        // source) so parallel links fan out instead of collapsing into one bundle.
        const t = start && start.n > 1 ? start.i / (start.n - 1) : 0.5;
        const dx = right.x - left.x;
        const c1x = left.x + dx * (0.2 + 0.6 * t);
        const c2x = left.x + dx * (0.8 - 0.6 * t);
        next.push({
          key: `${e.from}|${e.to}|${e.kind}`,
          d: `M${left.x},${left.y} C${c1x},${left.y} ${c2x},${right.y} ${right.x},${right.y}`,
          from: e.from,
          to: e.to,
        });
      }
      setPaths(next);
    };
    compute();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(compute);
    observer?.observe(root);
    window.addEventListener('resize', compute);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [report]);

  return (
    <div className="lanes" ref={rootRef}>
      <svg className="lane-edges" aria-hidden="true" focusable="false">
        {paths.map((p) => (
          <path
            key={p.key}
            d={p.d}
            data-active={selectedId !== undefined && (p.from === selectedId || p.to === selectedId)}
          />
        ))}
      </svg>
      {LANES.map(({ lane, label }) => {
        const nodes = report.nodes.filter((n) => n.lane === lane);
        return (
          <section className="lane" key={lane} aria-label={`${label}, ${nodes.length} records`}>
            <h3 className="lane-label">{label}</h3>
            {nodes.length === 0 ? <p className="lane-none">None linked</p> : null}
            {nodes.map((n) => (
              <button
                key={n.id}
                type="button"
                className="node"
                ref={(el) => {
                  if (el) nodeRefs.current.set(n.id, el);
                  else nodeRefs.current.delete(n.id);
                }}
                aria-pressed={selectedId === n.id}
                data-dim={connected !== undefined && !connected.has(n.id)}
                onClick={() => onSelect(n.id)}
              >
                <span className="node-kind figure">{nodeKind(n)}</span>
                <span className="node-title">{n.ref.title}</span>
                {n.status ? <span className="node-status">{n.status}</span> : null}
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}
