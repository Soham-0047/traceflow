# app/ — TraceFlow Forge app (TF-01, TF-04)

The Codegeist entry: a Jira global page (`TraceFlow` in Apps) hosting the shared
Workbench on this site's real data, plus (later) the Rovo agent. Everything here is
**UNVERIFIED until deployed** — it has never run against a real Forge runtime.

## What is inside

| Path | What |
| --- | --- |
| `manifest.yml` | Modules, scopes (`read:jira-work`, `read:confluence-content.all`, `storage:app`), font egress. Needs a real app id. |
| `src/backend/index.ts` | The `getGraph` resolver. |
| `src/backend/cache.ts` + `kvs.ts` | TTL cache over Forge KVS (tested without Forge). |
| `src/backend/graph.ts` | Jira/Confluence REST → `OrgGraph` through the core normalizers. **UNVERIFIED payload shapes (spike S1)**. |
| `src/frontend/` | The Custom UI build (vite, `npm run build` → `build/`), hosting `<Workbench>` via the forge adapter. |
| `test/` | Unit tests for the cache and the adapter (mocked `@forge/bridge`). |

## One-time setup (needs your Atlassian developer site; cannot be done from CI)

1. Install the Forge CLI (`npm install -g @forge/cli`) and log in (`forge login`).
2. From this folder run `forge register` (this creates the app id), then put the id
   in `manifest.yml` replacing `REPLACE_AFTER_FORGE_REGISTER`.
3. `forge deploy --non-interactive -e development`, then `forge install --site <your-site> --product jira --environment development`.
4. Open Jira → Apps → TraceFlow.
5. Add `FORGE_EMAIL` and `FORGE_API_TOKEN` (Atlassian API token) as GitHub Actions
   secrets so `forge-deploy.yml` can deploy from CI.

If `forge deploy` complains about the frontend, check that `src/frontend` built to
`build/` and that the resource path in `manifest.yml` still matches.

## After the first deploy (spikes, `docs/SPIKES.md`)

- **S1:** run the app on the dev site; fix `src/backend/graph.ts` payload shapes
  against real Jira/Confluence responses, and `packages/core/src/normalize.ts` if needed.
- **S3:** add the `rovo:agent` / `rovo:action` modules calling the same resolver.
- **S2:** Teamwork Graph enrichment behind a flag (adds names for contributor ids).

## Local commands (from the repo root)

```bash
npm run typecheck -w @traceflow/app   # typecheck the backend and the frontend source
npm test -w @traceflow/app            # cache + adapter unit tests
```
