import type { ReactNode } from 'react';
import type { DataAdapter } from '@traceflow/core';
import { DataProvider } from './data';
import { useRoute, hrefFor } from './router';
import type { View } from './router';
import { OverviewView } from './views/Overview';
import { DecisionsView } from './views/Decisions';
import { EpicsView } from './views/Epics';
import { ImpactView } from './views/Impact';
import { PeopleView } from './views/People';

const NAV: { view: View; label: string }[] = [
  { view: 'overview', label: 'Overview' },
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
  return (
    <>
      <a className="skip" href="#main">
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
      <main id="main" tabIndex={-1}>
        {route.view === 'overview' ? <OverviewView /> : null}
        {route.view === 'people' ? <PeopleView /> : null}
        {route.view === 'impact' ? <ImpactView /> : null}
        {route.view === 'epics' ? <EpicsView /> : null}
        {route.view === 'decisions' ? <DecisionsView /> : null}
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
