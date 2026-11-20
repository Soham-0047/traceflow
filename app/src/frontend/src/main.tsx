import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Workbench } from '@traceflow/ui';
// Figures use Geist Mono (OFL-1.1), bundled into the build so Forge needs no font egress.
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@traceflow/ui/styles.css';
import { createForgeAdapter } from './forge-adapter';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Workbench
      adapter={createForgeAdapter()}
      sourceNote="From this site's Jira and Confluence records"
      footerNote="TraceFlow reads Jira and Confluence records. Findings are audit-ready evidence, not proof of compliance."
    />
  </StrictMode>,
);
