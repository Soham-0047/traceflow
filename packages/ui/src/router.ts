import { useMemo, useSyncExternalStore } from 'react';

export type View = 'overview' | 'people' | 'impact' | 'epics' | 'decisions';

export interface Route {
  view: View;
  id?: string;
  /** Selected finding or node, kept in the URL so a view can be shared. */
  finding?: string;
}

const VIEWS: View[] = ['overview', 'people', 'impact', 'epics', 'decisions'];

export function parseHash(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));
  const view = VIEWS.find((v) => v === parts[0]) ?? 'overview';
  const finding = parts[2] === 'finding' ? parts[3] : undefined;
  return { view, id: parts[1], finding };
}

export function hrefFor(route: Route): string {
  let href = `#/${route.view}`;
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
