import type { Finding } from '@traceflow/core';
import { CONFIDENCE_LABEL } from './Evidence';
import { findingId } from './evidence-model';

/** Findings as a selectable list. Used for lineage gaps and decision findings. */
export function FindingList({
  findings,
  selectedId,
  onSelect,
  emptyText,
  label,
}: {
  findings: Finding[];
  selectedId?: string;
  onSelect: (id: string) => void;
  emptyText: string;
  label: string;
}) {
  if (findings.length === 0) return <p className="muted">{emptyText}</p>;
  return (
    <ul className="finding-list" aria-label={label}>
      {findings.map((f, i) => {
        const id = findingId(f, i);
        return (
          <li key={id}>
            <button
              type="button"
              className="finding"
              aria-current={selectedId === id ? 'true' : undefined}
              onClick={() => onSelect(id)}
            >
              <span className="finding-title">{f.title}</span>
              <span className="finding-meta">{CONFIDENCE_LABEL[f.confidence]} confidence</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
