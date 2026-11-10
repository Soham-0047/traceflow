# @traceflow/ui

The shared TraceFlow investigation UI (TF-03): the Overview dashboard, People ranked by risk with the handover ledger, Impact blast radii for people, epics and decisions, epic lineage lanes, decision traces, the Ask view (deterministic plain-language answers from the answer layer, with evidence and deep links into the matching investigation), and the Evidence card — each with loading, empty and error states.

It is one component. A host supplies a `DataAdapter` and imports the stylesheet:

```tsx
import { Workbench } from '@traceflow/ui';
import '@traceflow/ui/styles.css';

createRoot(root).render(
  <Workbench adapter={adapter} sourceNote="Connected to acme.atlassian.net" />,
);
```

Hosts today:
- `demo/` serves it on sample data (Netlify).
- The Forge Custom UI (TF-01) will serve it with an adapter whose `loadGraph` calls a resolver. Unverified sketch:
  ```tsx
  import { invoke } from '@forge/bridge';
  const adapter = { name: 'forge', loadGraph: () => invoke('loadGraph') };
  ```

Rules: components never fetch data themselves; selection lives in the URL hash (`#/people/<id>`, `#/impact/epic/<id>`, `#/ask/<encoded question>` …); design follows `/DESIGN.md` (Hallmark, Coral, app scope). The package is consumed from source through a bundler alias, so there is no build step. Run `npm test -w @traceflow/ui`.
