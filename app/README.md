# app/ — TraceFlow Forge app (TF-01, TF-04, TF-06)

The Codegeist entry: a Jira global page (`TraceFlow` in Apps) hosting the shared
Workbench on this site's real data, the Rovo agent (`TraceFlow Risk Analyst`), and all
nine TraceFlow tools as Rovo actions that `rovo:mcp` also exposes to MCP clients.
Everything here is **UNVERIFIED until deployed**: it has never run in a real Forge
runtime. What *is* verified offline: Atlassian's own manifest validator
(`@forge/manifest`, the library the Forge CLI uses) accepts `manifest.yml`, the Forge
CLI's client-side linters report 0 errors and 0 warnings, and every handler, action
and resource is cross-checked by `npm run forge:check` in CI.

## What is inside

| Path | What |
| --- | --- |
| `manifest.yml` | **Generated** by `scripts/forge-manifest.mjs` from the shared tool catalog (`packages/core/src/tools.ts`). Current Forge format: `app.id` + `app.runtime` (nodejs24.x), modules, scopes, no external permissions. Needs a real app id. |
| `src/backend/index.ts` | The `getGraph` resolver for the Workbench. |
| `src/backend/tools.ts` | One Rovo action handler per catalog tool (`investigate`, `listPeople`, `personRisk`, …). |
| `src/backend/agent.ts` | The question action (`traceflow-investigate`): the deterministic answer layer with honest misses. |
| `src/backend/site-graph.ts` | The one shared read: per-user KVS-cached fetch + best-effort pipeline. |
| `src/backend/graph.ts` | The Forge transport (`asUser().requestJira/requestConfluence`) for the shared site loader in `packages/core/src/site-loader.ts`. |
| `src/backend/cache.ts` + `kvs.ts` | TTL cache over Forge KVS; tolerates values over the 240 KiB cap and store failures. |
| `src/frontend/` | The Custom UI: vite builds it to `src/frontend/build`, which the manifest points at. Geist Mono is bundled; General Sans falls back to the system stack (DESIGN.md rule 10). |
| `test/` | Cache, adapter, agent, tool actions, and the Forge transport + per-user cache (`@forge/api` and `@forge/kvs` mocked). |

## How it reads the site

- **As the user.** Every read is `asUser()`, so Jira and Confluence enforce the
  viewer's permissions; the KVS cache is keyed per account, so one person's view is
  never served to another. Scopes: `read:jira-work`, `read:jira-user`,
  `read:page:confluence`, `storage:app`.
- **On the current APIs.** Jira issues from `GET /rest/api/3/search/jql` (the old
  `/rest/api/3/search` was removed from Jira Cloud and answers 410), Confluence pages and
  version history from the v2 API, display names from `GET /rest/api/3/user/bulk`.
  The loader, its paging guards and its coverage rules live in
  `packages/core/src/site-loader.ts` and are tested there.
- **Within budget.** Caps on issues (500), remote-link calls (80), pages (500),
  version-history calls (120) and name lookups (500), six calls in flight, 429/503
  retried with `Retry-After`, and a five-minute per-user cache. Every cap that cuts a
  read short is logged.

## One-time setup (needs your Atlassian developer site; cannot be done from CI)

1. Install the Forge CLI (`npm install -g @forge/cli`) and log in (`forge login`).
2. From this folder run `forge register`. It writes the real id into `app.id`;
   `npm run forge:manifest` keeps it from then on.
3. From the repo root: `npm ci && npm run forge:build && npm run forge:check`.
4. From this folder: `forge deploy --non-interactive -e development`, then
   `forge install --site <your-site>.atlassian.net --product jira --environment development`.
   Accept the consent prompt (the app reads as you).
5. Open Jira → Apps → TraceFlow. Talk to the agent in Rovo chat (`TraceFlow Risk Analyst`).
6. For CI deploys: add `FORGE_EMAIL` and `FORGE_API_TOKEN` as GitHub Actions secrets and
   run the **Forge deploy (manual)** workflow, which builds, checks and deploys.
7. Optional, for external MCP clients: a site admin enables the app's MCP tools under
   Atlassian Administration → Apps → Sites → Connected apps; clients then connect to
   `https://mcp.atlassian.com/forge/<app uuid>` (Preview).

## After the first deploy (spikes, `docs/SPIKES.md`)

- **S1:** run `traceflow-export --raw traceflow-raw` against the dev site (see
  `packages/mcp/README.md`) and diff the raw responses against the shapes in
  `site-loader.ts`; then open the Workbench and compare.
- **S3:** ask the agent the four conversation starters; check the action payloads in
  `forge logs`.
- **S2:** Teamwork Graph enrichment behind a flag.

## Local commands (from the repo root)

```bash
npm run typecheck -w @traceflow/app   # backend + Custom UI source
npm test -w @traceflow/app            # cache, adapter, agent, tool actions, transport
npm run build -w @traceflow/app       # the Custom UI into src/frontend/build
npm run forge:manifest                # regenerate manifest.yml from the tool catalog
npm run forge:check                   # Atlassian's validator + cross-checks (needs npm run build)
```
