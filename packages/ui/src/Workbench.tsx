import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { DataAdapter } from '@traceflow/core';
import { DataProvider } from './data';
import { useRoute, hrefFor } from './router';
import type { View } from './router';
import { OverviewView } from './views/Overview';
import { AskView } from './views/Ask';
import { DecisionsView } from './views/Decisions';
import { EpicsView } from './views/Epics';
import { ImpactView } from './views/Impact';
import { PeopleView } from './views/People';

const NAV: { view: View; label: string }[] = [
  { view: 'overview', label: 'Overview' },
  { view: 'ask', label: 'Ask' },
  { view: 'people', label: 'People' },
  { view: 'impact', label: 'Impact' },
  { view: 'epics', label: 'Epics' },
  { view: 'decisions', label: 'Decisions' },
];

interface ShellProps {
  /** Short honest note about where the data comes from, shown in the top bar. */
  sourceNote?: string;
  /** Optional quiet line at the bottom of the page. */
  footerNote?: ReactNode;
}

function Shell({ sourceNote, footerNote }: ShellProps) {
  const route = useRoute();
  const mainRef = useRef<HTMLElement>(null);

  // Focus management: when the VIEW changes (nav link, wordmark, back/forward),
  // move focus to <main> so keyboard and screen-reader users land on the new
  // view instead of the stale document.body. Subject/finding changes WITHIN a
  // view keep focus where it is — the ledger rows and rail links that caused
  // them stay focused, which is the correct in-view behaviour.
  const prevView = useRef<View>(route.view);
  useEffect(() => {
    if (prevView.current !== route.view) {
      prevView.current = route.view;
      mainRef.current?.focus({ preventScroll: true });
      mainRef.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [route.view]);

  return (
    <>
      {/* The skip link must not touch the hash: href="#main" sets
          location.hash, which the hash router parses as an unknown view and
          silently routes to Overview. It is a same-document fragment jump,
          handled here directly. */}
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
          mainRef.current?.scrollIntoView?.({ block: 'start' });
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="wordmark" href={hrefFor({ view: 'overview' })}>
            TraceFlow
          </a>
          <nav aria-label="Primary">
            <ul>
              {NAV.map((item) => (
                <li key={item.view}>
                  <a
                    href={hrefFor({ view: item.view })}
                    aria-current={route.view === item.view ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {sourceNote ? <p className="sample-note">{sourceNote}</p> : null}
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        {/* Keyed by VIEW only (not id): subject and finding changes reconcile
            in place, so focus, the Ask input's IME/selection state and the
            auto-select effects survive them, and each view's entrance settles
            exactly once per view switch. The Ask answer card keys its own
            exchange by question. */}
        <div className="view" key={route.view}>
          {route.view === 'overview' ? <OverviewView /> : null}
          {route.view === 'ask' ? <AskView /> : null}
          {route.view === 'people' ? <PeopleView /> : null}
          {route.view === 'impact' ? <ImpactView /> : null}
          {route.view === 'epics' ? <EpicsView /> : null}
          {route.view === 'decisions' ? <DecisionsView /> : null}
        </div>
      </main>
      {footerNote ? (
        <footer className="foot">
          <p>{footerNote}</p>
        </footer>
      ) : null}
    </>
  );
}

export interface WorkbenchProps extends ShellProps {
  adapter: DataAdapter;
}

/** The whole TraceFlow investigation UI. Hosts (demo site, Forge Custom UI) supply an adapter. */
export function Workbench({ adapter, ...shell }: WorkbenchProps) {
  return (
    <DataProvider adapter={adapter}>
      <Shell {...shell} />
    </DataProvider>
  );
}
