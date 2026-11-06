import type { DataAdapter } from '@traceflow/core';
import { DataProvider } from './data';
import { useRoute, hrefFor } from './router';
import type { View } from './router';
import { DecisionsView } from './views/Decisions';
import { EpicsView } from './views/Epics';
import { PeopleView } from './views/People';

const NAV: { view: View; label: string }[] = [
  { view: 'people', label: 'People' },
  { view: 'epics', label: 'Epics' },
  { view: 'decisions', label: 'Decisions' },
];

function Shell() {
  const route = useRoute();
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="wordmark" href={hrefFor({ view: 'people' })}>
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
          <p className="sample-note">Sample data, not connected to Jira</p>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {route.view === 'people' ? <PeopleView /> : null}
        {route.view === 'epics' ? <EpicsView /> : null}
        {route.view === 'decisions' ? <DecisionsView /> : null}
      </main>
      <footer className="foot">
        <p>
          A fictional team. To see the other states, add ?demo=loading, ?demo=empty or ?demo=error to the
          address.
        </p>
      </footer>
    </>
  );
}

export function App({ adapter }: { adapter: DataAdapter }) {
  return (
    <DataProvider adapter={adapter}>
      <Shell />
    </DataProvider>
  );
}
