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
      const next: EdgePath[] = [];
      for (const e of report.edges) {
        const a = nodeRefs.current.get(e.from);
        const b = nodeRefs.current.get(e.to);
        if (!a || !b) continue;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const [left, right] = ar.left <= br.left ? [ar, br] : [br, ar];
        const x1 = left.right - box.left;
        const y1 = left.top + left.height / 2 - box.top;
        const x2 = right.left - box.left;
        const y2 = right.top + right.height / 2 - box.top;
        const mx = (x1 + x2) / 2;
        next.push({ key: `${e.from}|${e.to}|${e.kind}`, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, from: e.from, to: e.to });
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
