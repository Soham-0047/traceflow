import type { ReactNode } from 'react';
import type { OrgGraph } from '@traceflow/core';
import { useGraph } from '../data';
import { ErrorState, LoadingRegion } from './States';

/** Handles the loading and error states once; children only ever see a ready graph. */
export function GraphGate({ label, children }: { label: string; children: (graph: OrgGraph) => ReactNode }) {
  const { state, retry } = useGraph();
  if (state.status === 'loading') {
    return (
      <div className="workspace workspace-single">
        <LoadingRegion label={label} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="workspace workspace-single">
        <ErrorState message={state.message} onRetry={retry} />
      </div>
    );
  }
  return <>{children(state.graph)}</>;
}
