import { useMemo, useSyncExternalStore } from 'react';

export type View = 'overview' | 'ask' | 'people' | 'impact' | 'epics' | 'decisions';

/**
 * What the impact view is scoped to. Persons keep the legacy single-segment
 * URL (`#/impact/<personId>`); epics and decisions carry a kind segment
 * (`#/impact/epic/PAY-1`, `#/impact/decision/d3`), so a person id can never
 * be mistaken for the kind words and the person URLs stay stable.
 */
export type ImpactKind = 'epic' | 'decision';

export interface Route {
  view: View;
  id?: string;
  /** Impact view only: the kind of record the id names. Undefined = person. */
  kind?: ImpactKind;
  /** Selected finding or node, kept in the URL so a view can be shared. */
  finding?: string;
}

const VIEWS: View[] = ['overview', 'ask', 'people', 'impact', 'epics', 'decisions'];

// NOTE: on the ask view, `id` carries the URL-encoded QUESTION, not a record
// id (`#/ask/What%20breaks%20if%20Alex%20leaves%3F`). encodeURIComponent keeps
// it single-segment (slashes encoded), so parseHash's generic branch handles it.

export function parseHash(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));
  const view = VIEWS.find((v) => v === parts[0]) ?? 'overview';
  // `#/impact/epic` and `#/impact/epic/PAY-1/finding/<id>` — the kind segment
  // shifts every later position. A bare kind URL (no id) is also a kind route:
  // the view auto-selects the first epic or decision. The only cost: a person
  // whose id is literally "epic" or "decision" is unreachable by hash.
  if (view === 'impact' && (parts[1] === 'epic' || parts[1] === 'decision')) {
    return { view, kind: parts[1], id: parts[2], finding: parts[3] === 'finding' ? parts[4] : undefined };
  }
  return { view, id: parts[1], finding: parts[2] === 'finding' ? parts[3] : undefined };
}

export function hrefFor(route: Route): string {
  let href = `#/${route.view}`;
  // The kind segment belongs to the path, not the id: a bare `#/impact/epic`
  // is the epics tab with no epic picked yet (the view auto-selects one).
  if (route.view === 'impact' && route.kind) href += `/${route.kind}`;
  if (route.id) href += `/${encodeURIComponent(route.id)}`;
  if (route.id && route.finding) href += `/finding/${encodeURIComponent(route.finding)}`;
  return href;
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  return useMemo(() => parseHash(hash), [hash]);
}

export function go(route: Route, replace = false): void {
  const href = hrefFor(route);
  if (replace) window.location.replace(href);
  else window.location.hash = href;
}
