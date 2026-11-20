# Validation spikes

Four short experiments that decide what the Forge app can really do. Do them **before** investing in Forge UI work. Each has an exit criterion; record the outcome in `docs/PROGRESS.md`.

Everything below that touches Atlassian is **unverified**: it was written from documentation, and the agent sandbox cannot reach Atlassian. Treat code here as a starting point, and trust the real site over this file.

## Setup (once, by Soham)
1. Provision a free development site: https://developer.atlassian.com/platform/forge/provision-a-demo-development-site/ (Atlassian Cloud Developer License gives Jira and Confluence).
2. Install the Forge CLI, `forge login`, then run `forge register` inside `app/` (it writes the real `app.id`; `npm run forge:manifest` keeps it). Do not `forge create` a new app: `app/` is complete.
3. Add `FORGE_EMAIL` and `FORGE_API_TOKEN` as GitHub Actions secrets, then run the **Forge deploy (manual)** workflow.
4. Docs that help agents: Forge AI development toolkit (Forge MCP Server, Forge skills) https://developer.atlassian.com/platform/forge/ai-development-toolkit/

## S1: Jira and Confluence in one app (the gate)
**Question:** do the real payloads match the shapes the shared loader (`packages/core/src/site-loader.ts`) was written from, and does the Forge app read both products as the user?
**How (session 18: two commands, no code to write):**
1. *Payloads, before any deploy.* With an API token for the dev site, from the repo root:
   ```bash
   npm ci && npm run build
   ATLASSIAN_SITE_URL=https://<site>.atlassian.net ATLASSIAN_EMAIL=you@example.com ATLASSIAN_API_TOKEN=... \
     node packages/mcp/dist/export-cli.js --out graph.json --raw traceflow-raw
   ```
   `traceflow-raw/` gets every raw response (Jira enhanced search `/rest/api/3/search/jql`, remote links, user bulk, Confluence v2 pages and versions) next to its path; stderr gets the read report (counts, caps hit, warnings). Diff the raw bodies against the raw-shape interfaces at the top of `site-loader.ts` and `normalize.ts`. Do not commit the raw folder (it is git-ignored; it holds site data).
2. *Forge, after `forge register` + deploy.* Open Jira → Apps → TraceFlow and compare with `graph.json`: same issues, pages and links (the app reads as you, the export reads as the token owner; same person = same graph). `forge logs` shows the loader's read report.
**Exit:** an epic with at least one linked Confluence page and its child issues appears in both, the read report has no unexpected warnings, and a sole-contributor finding points at a page whose history was read. If a shape differs, fix the loader or normalizer **and record the payload in a test** (`packages/core/test/site-loader.test.ts`).
**If it fails:** re-scope to whichever product works. Nothing else proceeds until this passes.

## S2: Teamwork Graph
**Question:** does Teamwork Graph work on the dev site, and is the app allowed to use it?
**Verified from docs (Feb 2026 page, still in Preview):** call it with `api.asUser().requestTeamworkGraph(query)` in a resolver, or `requestTeamworkGraph` from `@forge/bridge` in the frontend; a built-in `echo` query tests connectivity; queries are Cypher wrapped in GraphQL; scopes go in `manifest.yml` under `permissions.scopes` (the page shows `read:graph:issue:jira` and also `read:graph:jira` / `read:graph:confluence` in troubleshooting, so check the exact names on https://developer.atlassian.com/platform/teamwork-graph/scopes/).
**Risk found:** the troubleshooting section says an "Authentication failed or Unauthorized" error can mean the **app must be allowlisted** by Atlassian support using the app ID. Ask early if `echo` fails.
**Docs:** https://developer.atlassian.com/platform/forge/call-the-teamwork-graph-api/ · query tool https://teamwork-graph.atlassian.com/query-builder · curated queries https://developer.atlassian.com/platform/teamwork-graph/curated-queries/
**Exit:** `echo` succeeds, then one contributors-style query returns data for a real page.
**If it fails:** keep the adapter stubbed behind a feature flag, drop it from the MVP, and keep core on Jira and Confluence REST (decision D1).

## S3: Rovo agent
**Question:** can a Rovo agent be installed and call a Forge action that returns a TraceFlow report?
**Docs:** https://developer.atlassian.com/platform/forge/build-a-hello-world-rovo-agent/ and the MCP variant https://developer.atlassian.com/platform/forge/build-a-hello-world-rovo-mcp/
**Exit:** asking the agent for the risks of a named person returns text built from `assessPersonRisk`, with record links.
**If it fails:** ship the UI without Rovo and say so; the Best Agents bonus is then out of reach.

## S4: Bitbucket pull requests
**Question:** is there a supported way for the app to read pull requests (title, author, state) and link them to Jira issues?
**Docs:** https://developer.atlassian.com/platform/forge/extend-bitbucket-cloud/ (Bitbucket modules) and Jira's development information for issues.
**Exit:** a PR appears as a `PullRequest` in the graph, linked from its issue.
**If it fails:** Bitbucket stays out of scope. The engine already skips pull-request findings when no PR data is connected.
