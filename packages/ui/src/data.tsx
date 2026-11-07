import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { DataAdapter, OrgGraph } from '@traceflow/core';

export type GraphState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; graph: OrgGraph };

interface DataContextValue {
  state: GraphState;
  retry: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ adapter, children }: { adapter: DataAdapter; children: ReactNode }) {
  const [state, setState] = useState<GraphState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    adapter
      .loadGraph()
      .then((graph) => !cancelled && setState({ status: 'ready', graph }))
      .catch((err: unknown) =>
        !cancelled &&
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' }),
      );
    return () => {
      cancelled = true;
    };
  }, [adapter, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const value = useMemo(() => ({ state, retry }), [state, retry]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useGraph(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useGraph must be used inside <DataProvider>');
  return ctx;
}
