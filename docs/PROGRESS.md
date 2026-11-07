# TraceFlow progress index

Last updated: 2026-11-07 (session 3). Read `AGENTS.md` first, and see `PRODUCTS.md` for what each workstream builds. This file is the resume point for any new session or agent: update it before you stop.

<!-- progress:start -->
| Workstream | Tier | Done | Total | Complete |
| --- | --- | --- | --- | --- |
| Planning and docs | T1 | 5 | 7 | 71% |
| TF-02 Engine (packages/core) | T1 | 8 | 12 | 67% |
| TF-03 Workbench and public demo (packages/ui, demo) | T1 | 10 | 12 | 83% |
| TF-01 Forge app (app) | T1 | 3 | 7 | 43% |
| TF-04 Agent (Rovo) and Teamwork Graph | T1 | 0 | 5 | 0% |
| CI/CD and hosting | T1 | 5 | 8 | 63% |
| Submission | T1 | 0 | 4 | 0% |
| TF-05 Seeder and demo kit (tools/seeder) | T1 | 3 | 3 | 100% |
| TF-08 Site and docs (site) | T1 | 1 | 3 | 33% |
| TF-06 MCP server (packages/mcp) | T2 | 0 | 3 | 0% |
| TF-07 Check, the pull-request provenance gate (packages/check) | T2 | 0 | 3 | 0% |
| TF-09 Cloud, the standalone web app (apps/cloud) | T3 | 0 | 3 | 0% |
| TF-10 Connectors (packages/connectors) | T3 | 0 | 3 | 0% |
| TF-11 Impact, change impact analysis | T3 | 0 | 2 | 0% |
| TF-12 Promises | T3 | 0 | 2 | 0% |
| **Tier 1 (ships for the hackathon)** | T1 | **35** | **61** | **57%** |
| **All tiers** | all | **35** | **77** | **45%** |
<!-- progress:end -->

The table counts the checkboxes under **Workstreams** and is rebuilt with `npm run progress:write` (CI fails if it is stale). Counts measure planned tasks, not effort.

## Resume here
Schedule check on 2026-11-07: 46 days to the Dec 23 deadline. The engine, Workbench, Forge scaffold, seeder and landing page are all built and tested in the sandbox; the critical path is still Atlassian access.

Next actions, highest first:
1. **Soham:** enable GitHub Pages (repo Settings → Pages → Build and deployment → Source: **GitHub Actions**). The `pages.yml` workflow then publishes the landing page at `https://soham-0047.github.io/traceflow/` and the demo at `/traceflow/demo/` on the next push. No other setup.
2. **Soham:** create the Atlassian dev site, run `forge register` in `app/`, put the app id in `app/manifest.yml` (replacing `REPLACE_AFTER_FORGE_REGISTER`), and add the `FORGE_EMAIL` / `FORGE_API_TOKEN` secrets. Everything Forge-side is scaffolded and unit-tested; `app/README.md` has the steps.
3. **Run spike S1** (`docs/SPIKES.md`), then fix `app/src/backend/graph.ts` and `packages/core/src/normalize.ts` against real payloads.
4. **Soham:** run the seeder against the dev site (`npm run seed -w @traceflow/seeder`, dry-run by default, `--apply` for real; needs the env vars in `tools/seeder/src/cli.ts`).
5. Screen-reader pass over the Workbench (NVDA or VoiceOver); the keyboard pass is done.
6. Rovo agent (TF-04) once S1 passes: `rovo:agent` / `rovo:action` modules calling the same resolver.

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
- [x] Overview aggregates (rank epics, organization health)
- [ ] Document the `OrgGraph` schema in `PRODUCTS.md` once S1 to S4 settle it

### [T1] TF-03 Workbench and public demo (packages/ui, demo)
- [x] App shell with top bar and hash routing (state lives in the URL)
- [x] People view: ranking, handover ledger, evidence card
- [x] Epics view: lane diagram with linked-record highlighting and gaps
- [x] Decisions view: linked work, people and roles, findings
- [x] Loading, empty and error states, with `?demo=` switches
- [x] 15 UI tests (routing, overview, ledger totals, evidence, the four states) and 4 demo-adapter tests
- [x] Hallmark static lint at 0 FAIL, 0 WARN
- [x] Visual review in a real browser at desktop and phone widths
- [x] Hallmark render-tier lint (headless browser, 0 FAIL 0 WARN; 3 reflexes waived and 2 finish answers on the record in the CSS stamp)
- [ ] Keyboard and screen-reader pass (keyboard order, focus visibility and labels done; a screen-reader pass is still owed)
- [ ] Netlify site connected with a public URL (GitHub Pages is the canonical public URL meanwhile; see CI/CD)
- [x] Extract the UI into `packages/ui` (`Workbench`) so the Forge Custom UI can host it

### [T1] TF-01 Forge app (app)
- [ ] App registered with `forge register` (needs Soham; `app/README.md` has the steps)
- [ ] S1: Jira and Confluence data in one resolver
- [x] Resolvers returning `OrgGraph` through the adapter interface (code + mocked tests; UNVERIFIED against the Forge runtime)
- [x] Custom UI wired to the shared components (`app/src/frontend`, builds with vite; UNVERIFIED inside Forge)
- [x] KVS caching with short TTLs, usage within free allowances (cache logic unit-tested; usage unverified until deploy)
- [ ] Minimal manifest scopes (drafted in `app/manifest.yml`; confirm after first deploy)
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
- [x] GitHub Pages workflow (`pages.yml`: landing page at `/`, demo at `/demo/`, no secrets)
- [ ] GitHub Pages enabled in repo settings (Soham: Settings → Pages → Source: GitHub Actions)
- [ ] GitHub secrets `FORGE_EMAIL` and `FORGE_API_TOKEN` set
- [ ] Netlify connected to the repo (optional second URL)

### [T1] Submission
- [ ] Marketplace listing or review ticket
- [ ] Demo video (about 5 minutes)
- [ ] Devpost entry with App ID and bonus categories declared
- [ ] Final README with install steps

### [T1] TF-05 Seeder and demo kit (tools/seeder)
- [x] Idempotent seed script for a dev site: epics, pages, remote links, decisions (planner unit-tested on fixtures; REST apply is UNVERIFIED until it runs against a real site)
- [x] Mapping of the fictional people onto the real dev-site accounts (`SEED_MAP` env; unmapped people stay unassigned)
- [x] Demo script and shot list (`docs/demo-script.md`)

### [T1] TF-08 Site and docs (site)
- [x] Choose the static stack and lock a page variant of the design system in `DESIGN.md` (plain HTML + CSS, Hallmark page flow, render tier clean)
- [ ] Pitch, how it works, install steps, judge guide, honest-wording notes (pitch, how it works, evidence and honest wording are on the page; install steps and the judge guide wait for a deployed app and the video)
- [ ] Public URL linked from the README and Devpost (Pages URL is in the README; it goes live once Pages is enabled)

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
Verified (run in the build sandbox, session 3): 69 tests (38 core, 15 UI, 4 demo, 7 app, 5 seeder), typecheck and build across all workspaces, the Forge Custom UI frontend builds with vite, Hallmark static lint 0 FAIL 0 WARN (app scope) and 0 FAIL 0 REFLEX 0 WARN (page scope), the Hallmark **render tier** run with a headless browser at 320 to 1920px over both the site and the four demo views (0 FAIL 0 WARN; three reflexes waived and two finish answers on the record in `packages/ui/src/styles/app.css`), a visual review of all views at 1280 and 390 with screenshots (overview, people, epics, decisions, the four states, the landing page), a keyboard pass (tab order, focus visibility, skip link), contrast of the muted token on paper at 14.2:1, and no console errors or horizontal overflow on any checked page.

Unverified: everything that touches Atlassian (Forge runtime behaviour, manifest validity, REST payload shapes, KVS call shapes, Rovo, the seeder's REST calls against a real site); the GitHub Pages deployment end-to-end (the workflow is ready; Pages must be enabled in repo settings); Netlify.

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
| D17 | GitHub Pages (via `pages.yml`, no secrets) is the canonical public URL: landing page at `/`, demo at `/demo/`; Netlify stays an optional second URL | $0, zero external accounts, deploys on push; enabled once in repo settings. Render and Vercel stay skipped (D4) |
| D18 | Overview is the default landing view: top risks, epics by gaps, record counts, each linking into its investigation | Homepage is an investigation dashboard (PLAN §2); `buildOverview` in packages/core |
| D19 | The ledger keeps its five columns on phones and scrolls sideways with a swipe hint instead of restacking | Answered F25 on the record: restacking hides the records × weight = points arithmetic |
| D20 | The Forge app ships as a scaffold with a placeholder app id until `forge register`; `forge-deploy.yml` refuses to run with the placeholder in place | `app/README.md` holds the one-time steps |
| D21 | The seeder seeds the sample story itself (fixtures are the single source); API pages are authored by the token owner, so sole-contributor findings are expected on seeded sites; decisions follow the `Decision: ` title convention read by `deriveDecisions` | `tools/seeder`; honest limits documented in its source |
| D22 | Lane connectors fan out: per-edge anchors on each card edge and per-edge control points, replacing the single shared midpoint | Fixes the bundled-connector finding from the session 3 visual review |

## Blockers needing Soham
- Enable GitHub Pages: repo Settings → Pages → Build and deployment → Source: **GitHub Actions** (one flip; `pages.yml` does the rest).
- Confirm that "any tech stack" does not also relax the $0 budget (assumed it does not).
- Free Atlassian development site, `forge register`, and the real app id in `app/manifest.yml`.
- GitHub secrets `FORGE_EMAIL` and `FORGE_API_TOKEN`.
- Netlify (optional now that Pages is the canonical URL): connect the repo from Netlify's UI.
- Devpost registration, and confirm the exact 2026 deadline time.
- **Revoke the GitHub token that was pasted into the chat once this session is pushed** and create a fresh short-lived one for the next push session.
- If Teamwork Graph returns an authorization error, ask Atlassian support to allowlist the app ID (see S2).

## Session log (newest first)
- **2026-11-07, session 3, latest.** Overview end to end: `buildOverview` in core (ranked epics, org health counts, coverage) with 6 tests, and a new Overview view as the default landing page (15 UI tests total). Forge app scaffolded in `app/` (manifest with placeholder id, `getGraph` resolver with a unit-tested KVS TTL cache, Custom UI hosting the Workbench, forge adapter with mocked `@forge/bridge` tests, 7 app tests). Seeder in `tools/seeder` (sample story from the fixtures, idempotent planner with 5 tests, dry-run CLI). Landing page in `site/` (Hallmark page flow, Coral page variant locked in `DESIGN.md`, clean on static and render tiers). Hosting: `pages.yml` publishes site + demo to GitHub Pages (D17); `forge-deploy.yml` now refuses the placeholder app id. Real-browser review of every view at 1280/390 with the four states: fixed the double-spaced overview rhythm, fanned the lane connectors out from per-edge anchors (D22), made the ledger scroll with a swipe hint on phones (D19), tightened mobile tables. Render tier run for the first time (site and demo) and brought to 0 FAIL 0 WARN. All checks green: 69 tests, typecheck, build, both lint tiers.
- **2026-11-06, session 2, latest.** Extracted the UI into `packages/ui` (`Workbench`, props for source note and footer), made `demo/` a thin host with its own adapter tests, retargeted design lint, wrote `docs/demo-script.md` and `packages/ui/README.md`. All checks green: 29 core, 12 UI and 4 demo tests, build, lint.
- **2026-11-06, session 2, later.** Wrote `PRODUCTS.md`: twelve products in three tiers, the shared contracts, stack defaults, prize mapping and rules for parallel agents. Progress table now reports Tier 1 separately from all tiers. No product code written; T2 and T3 are briefs only.
- **2026-11-06, session 2.** Vendored Hallmark (MIT) and dealt the Coral theme at app scope. Built `demo/` (People ledger, Epics lane diagram, Decisions, evidence card, four states with `?demo=` switches, 12 UI tests, Hallmark lint at 0 FAIL and 0 WARN). Added `DESIGN.md`, `AGENTS.md`, `CLAUDE.md`, `docs/SPIKES.md`, this index with a generated progress table, the Netlify config, and CI steps for design lint and the progress check. Not done: anything needing Atlassian access, a real browser (no screenshots or render-tier lint), or Netlify.
- **2026-11-01, session 1.** Researched the direction and platforms (Forge hosting, free allowances, CI, Teamwork Graph Preview status); wrote `docs/PLAN.md`; pushed the first commit. Built `packages/core`: risk scoring and ranking, epic lineage, decision tracing, Jira and Confluence normalizers, rule text, richer fixtures, 29 tests.
