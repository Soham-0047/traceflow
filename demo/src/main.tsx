import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Workbench } from '@traceflow/ui';
import '@traceflow/ui/styles.css';
import { createDemoAdapter } from './adapters';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Workbench
      adapter={createDemoAdapter(window.location.search)}
      sourceNote="Sample data, not connected to Jira"
      footerNote="A fictional team. To see the other states, add ?demo=loading, ?demo=empty or ?demo=error to the address."
    />
  </StrictMode>,
);
