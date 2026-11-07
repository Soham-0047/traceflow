# TraceFlow progress index

Last updated: 2026-11-06 (session 2). Read `AGENTS.md` first, and see `PRODUCTS.md` for what each workstream builds. This file is the resume point for any new session or agent: update it before you stop.

<!-- progress:start -->
| Workstream | Tier | Done | Total | Complete |
| --- | --- | --- | --- | --- |
| Planning and docs | T1 | 5 | 7 | 71% |
| TF-02 Engine (packages/core) | T1 | 7 | 12 | 58% |
| TF-03 Workbench and public demo (packages/ui, demo) | T1 | 8 | 12 | 67% |
| TF-01 Forge app (app) | T1 | 0 | 7 | 0% |
| TF-04 Agent (Rovo) and Teamwork Graph | T1 | 0 | 5 | 0% |
| CI/CD and hosting | T1 | 4 | 6 | 67% |
| Submission | T1 | 0 | 4 | 0% |
| TF-05 Seeder and demo kit (tools/seeder) | T1 | 1 | 3 | 33% |
| TF-08 Site and docs (site) | T1 | 0 | 3 | 0% |
| TF-06 MCP server (packages/mcp) | T2 | 0 | 3 | 0% |
| TF-07 Check, the pull-request provenance gate (packages/check) | T2 | 0 | 3 | 0% |
| TF-09 Cloud, the standalone web app (apps/cloud) | T3 | 0 | 3 | 0% |
| TF-10 Connectors (packages/connectors) | T3 | 0 | 3 | 0% |
| TF-11 Impact, change impact analysis | T3 | 0 | 2 | 0% |
| TF-12 Promises | T3 | 0 | 2 | 0% |
| **Tier 1 (ships for the hackathon)** | T1 | **25** | **59** | **42%** |
| **All tiers** | all | **25** | **75** | **33%** |
<!-- progress:end -->

The table counts the checkboxes under **Workstreams** and is rebuilt with `npm run progress:write` (CI fails if it is stale). Counts measure planned tasks, not effort.

## Resume here
Schedule check on 2026-11-06: 47 days to the Dec 23 deadline. The plan's Nov 1 to 8 window for setup and spikes is nearly used up and is still waiting on the Atlassian dev site, so that is the critical path.

Next actions, highest first:
1. **Soham:** create the Atlassian dev site, run `forge create`, share the `app.id` line, add the two GitHub secrets (see Blockers). Nothing Forge-side can start before this.
2. **Run spike S1** (`docs/SPIKES.md`), then fix `packages/core/src/normalize.ts` against real payloads.
3. **Visual review of the demo** in a real browser (not possible in the build sandbox): run `npm run dev -w @traceflow/demo`, check the three views at 1280 and 390 wide, then run Hallmark's render tier.
4. Connect the repo to Netlify (UI, no token) so the demo gets a public URL.
5. Wire Forge resolvers to the `OrgGraph` adapter interface and host `<Workbench>` in the Forge Custom UI (`packages/ui/README.md`).

## Workstreams

### [T1] Planning and docs
- [x] Project plan with scope, decisions, architecture, timeline (`docs/PLAN.md`)
- [x] Progress index and agent entry point (`docs/PROGRESS.md`, `AGENTS.md`, `CLAUDE.md`)
- [x] Locked design system and product rules (`DESIGN.md`)
- [x] Validation spike guide (`docs/SPIKES.md`)
- [x] Product catalog with tiers, contracts, stack defaults and multi-agent rules (`PRODUCTS.md`)
- [ ] Confirm the 2026 Codegeist rules, categories and exact deadline time on Devpost
- [ ] Draft the Devpost description and the demo script against the final feature set

### [T1] TF-02 Engine (packages/core)
- [x] `OrgGraph` types and the data-adapter interface
- [x] Person knowledge-risk assessment with transparent weights and ranking
- [x] Epic lineage (intent, plan, work, code) with coverage-aware gaps
- [x] Decision tracing (linked work, people with roles, stale or unapproved findings)
- [x] Jira and Confluence record normalizers and graph builder
- [x] Plain-language rule text for every finding kind
- [x] Sample fixtures and 29 unit tests
- [ ] Validate normalizers against live Jira and Confluence payloads (S1)
- [ ] Map Teamwork Graph results into `OrgGraph` (S2)
- [ ] Map Bitbucket pull requests into `OrgGraph` (S4)
- [ ] Overview aggregates (rank epics, organization health)
- [ ] Document the `OrgGraph` schema in `PRODUCTS.md` once S1 to S4 settle it

### [T1] TF-03 Workbench and public demo (packages/ui, demo)
- [x] App shell with top bar and hash routing (state lives in the URL)
- [x] People view: ranking, handover ledger, evidence card
- [x] Epics view: lane diagram with linked-record highlighting and gaps
- [x] Decisions view: linked work, people and roles, findings
- [x] Loading, empty and error states, with `?demo=` switches
- [x] 12 UI tests (routing, ledger totals, evidence, the four states) and 4 demo-adapter tests
- [x] Hallmark static lint at 0 FAIL, 0 WARN
- [ ] Visual review in a real browser at desktop and phone widths
- [ ] Hallmark render-tier lint (needs a headless browser)
- [ ] Keyboard and screen-reader pass
- [ ] Netlify site connected with a public URL
- [x] Extract the UI into `packages/ui` (`Workbench`) so the Forge Custom UI can host it

### [T1] TF-01 Forge app (app)
- [ ] App registered with `forge create` (needs Soham)
- [ ] S1: Jira and Confluence data in one resolver
- [ ] Resolvers returning `OrgGraph` through the adapter interface
- [ ] Custom UI wired to the shared components
- [ ] KVS caching with short TTLs, usage within free allowances
- [ ] Minimal manifest scopes
- [ ] First successful `forge deploy` from GitHub Actions

### [T1] TF-04 Agent (Rovo) and Teamwork Graph
- [ ] S2: Teamwork Graph echo and one real query (may need allowlisting)
- [ ] S3: Rovo agent installed and calling a Forge action
- [ ] On-demand agent action: top knowledge-continuity risks for a person or project
- [ ] Explainer interface so explanations come only from evidence JSON
- [ ] `rovo:mcp` tools (stretch, Best app with MCP)

### [T1] CI/CD and hosting
- [x] CI: typecheck, tests, build on every push
- [x] Manual Forge deploy workflow (untested)
- [x] Netlify build config
- [x] Hallmark design lint and progress-table check wired into CI
- [ ] GitHub secrets `FORGE_EMAIL` and `FORGE_API_TOKEN` set
- [ ] Netlify connected to the repo

### [T1] Submission
- [ ] Marketplace listing or review ticket
- [ ] Demo video (about 5 minutes)
- [ ] Devpost entry with App ID and bonus categories declared
- [ ] Final README with install steps

### [T1] TF-05 Seeder and demo kit (tools/seeder)
- [ ] Idempotent seed script for a dev site: epics, pages, remote links, decisions (needs an API token from Soham)
- [ ] Mapping of the fictional people onto the real dev-site accounts
- [x] Demo script and shot list (`docs/demo-script.md`)

### [T1] TF-08 Site and docs (site)
- [ ] Choose the static stack and lock a page variant of the design system in `DESIGN.md`
- [ ] Pitch, how it works, install steps, judge guide, honest-wording notes
- [ ] Public URL linked from the README and Devpost

### [T2] TF-06 MCP server (packages/mcp)
- [ ] Server with `assess_person_risk`, `trace_epic`, `trace_decision`, `list_people_by_risk` on fixtures
- [ ] Real-site adapter using an API token
- [ ] README with client configuration

### [T2] TF-07 Check, the pull-request provenance gate (packages/check)
- [ ] CLI: pull-request text to Jira key to intent chain, offline on fixtures
- [ ] GitHub Action wrapper, run in this repo's CI
- [ ] Bitbucket Pipe and a real-site mode

### [T3] TF-09 Cloud, the standalone web app (apps/cloud)
- [ ] Architecture decision and free-tier check (proposal: Hono, Cloudflare Workers, D1)
- [ ] Atlassian OAuth 2.0 (3LO) and multi-site sync
- [ ] Snapshots and risk-over-time view

### [T3] TF-10 Connectors (packages/connectors)
- [ ] Contract-test harness for `DataAdapter` implementations
- [ ] GitHub connector (pull requests by issue key)
- [ ] Slack or Teams, Drive or Notion, Compass connectors

### [T3] TF-11 Impact, change impact analysis
- [ ] Engine module that traverses lineage for a changed decision, epic or person
- [ ] Impact view in the Workbench

### [T3] TF-12 Promises
- [ ] Commitment detection in Confluence notes
- [ ] On-demand Rovo skill that offers to create and link a Jira issue

## Verified vs unverified
Verified (run in the build sandbox, session 2): core tests (29) and demo tests (12) pass; typecheck passes; `vite build` succeeds; Hallmark static lint 0 FAIL, 0 WARN; CI passed on the first push.

Unverified: everything that touches Atlassian (Forge deploy, REST payload shapes, Teamwork Graph, Rovo); `forge-deploy.yml`; how the demo actually renders (no browser in the sandbox, so no screenshots and no Hallmark render tier); web fonts loading; Netlify deploy.

## Decision log
| ID | Decision | Notes |
| --- | --- | --- |
| D1 | Build on Jira and Confluence REST first; Teamwork Graph is an enrichment behind a flag | Preview API, scopes, possible allowlisting |
| D2 | Bitbucket is a spike, not a promise | S4 |
| D3 | Rovo agent is on-demand | Not a background monitor |
| D4 | Everything runs on Forge | No Render; keeps data on Atlassian |
| D5 | Pure-TypeScript core behind a data-adapter interface | Testable without Atlassian |
| D6 | No external LLM or API key | Deterministic scoring; Rovo provides the AI |
| D7 | Superseded by D9 for the MVP | Was: `@xyflow/react` |
| D8 | No giant graph on the homepage | Investigations first |
| D9 | Lineage is a lane diagram in HTML with an SVG connector layer, not a graph library | Fewer dependencies, accessible buttons, easy to test, fits Forge limits |
| D10 | Design: Hallmark, Coral theme at app scope, top-bar shell, light only | Vendored in `.claude/skills/hallmark`; rules in `DESIGN.md` |
| D11 | Demo imports core from source through an alias | No build step before the demo |
| D12 | Demo adapter exposes `?demo=loading|empty|error` | Lets judges and reviewers see all four states |
| D13 | Tech stack is open per product; default is TypeScript; the Codegeist app stays on Forge | Soham, 2026-11-06. Budget stays $0 (assumed; see Blockers) |
| D14 | Work is tiered: T1 ships by Dec 21, T2 only if it helps T1, T3 is briefs until after | Protects the deadline; see `PRODUCTS.md` |
| D15 | Parallel agents claim a workstream, use `agent/<product>-<topic>` branches and pull requests, keep `main` green | Single-agent pushes to `main` happened in sessions 1 and 2 |
| D16 | UI lives in `packages/ui` as one `Workbench` component; `demo/` is a thin host | Lets the Forge Custom UI reuse it unchanged |

## Blockers needing Soham
- Confirm that "any tech stack" does not also relax the $0 budget (assumed it does not).
- Free Atlassian development site, `forge create`, and the `app.id` from `manifest.yml`.
- GitHub secrets `FORGE_EMAIL` and `FORGE_API_TOKEN`.
- Netlify: connect the repo from Netlify's UI.
- Devpost registration, and confirm the exact 2026 deadline time.
- **Revoke the GitHub token that was pasted into the chat in session 1** and create a fresh short-lived one for the next push session.
- If Teamwork Graph returns an authorization error, ask Atlassian support to allowlist the app ID (see S2).

## Session log (newest first)
- **2026-11-06, session 2, latest.** Extracted the UI into `packages/ui` (`Workbench`, props for source note and footer), made `demo/` a thin host with its own adapter tests, retargeted design lint, wrote `docs/demo-script.md` and `packages/ui/README.md`. All checks green: 29 core, 12 UI and 4 demo tests, build, lint.
- **2026-11-06, session 2, later.** Wrote `PRODUCTS.md`: twelve products in three tiers, the shared contracts, stack defaults, prize mapping and rules for parallel agents. Progress table now reports Tier 1 separately from all tiers. No product code written; T2 and T3 are briefs only.
- **2026-11-06, session 2.** Vendored Hallmark (MIT) and dealt the Coral theme at app scope. Built `demo/` (People ledger, Epics lane diagram, Decisions, evidence card, four states with `?demo=` switches, 12 UI tests, Hallmark lint at 0 FAIL and 0 WARN). Added `DESIGN.md`, `AGENTS.md`, `CLAUDE.md`, `docs/SPIKES.md`, this index with a generated progress table, the Netlify config, and CI steps for design lint and the progress check. Not done: anything needing Atlassian access, a real browser (no screenshots or render-tier lint), or Netlify.
- **2026-11-01, session 1.** Researched the direction and platforms (Forge hosting, free allowances, CI, Teamwork Graph Preview status); wrote `docs/PLAN.md`; pushed the first commit. Built `packages/core`: risk scoring and ranking, epic lineage, decision tracing, Jira and Confluence normalizers, rule text, richer fixtures, 29 tests.
