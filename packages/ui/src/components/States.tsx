import type { ReactNode } from 'react';

/** Loading: a skeleton in the shape of what is coming. */
export function LoadingRegion({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <div className="state state-loading" role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div aria-hidden="true" className="sk-stack">
        <span className="sk sk-title" />
        {Array.from({ length: rows }, (_, i) => (
          <span className="sk sk-row" key={i} />
        ))}
      </div>
    </div>
  );
}

/** Empty: what belongs here, and the one action that fills it. The title is an h1: every place this state renders is the whole main region, with no other page heading above it. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/** Error: what broke and what to do about it. h1 for the same reason as EmptyState: the error state replaces the whole main region. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <h1>Could not load the data</h1>
      <p>{message} Nothing was changed.</p>
      <button type="button" className="btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
