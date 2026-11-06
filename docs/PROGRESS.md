# TraceFlow progress index

Last updated: 2026-11-06 (session 2). Read `AGENTS.md` first. This file is the resume point for any new session or agent: update it before you stop.

<!-- progress:start -->
| Workstream | Done | Total | Complete |
| --- | --- | --- | --- |
| Planning and docs | 4 | 6 | 67% |
| Core engine (packages/core) | 7 | 11 | 64% |
| Demo UI (demo) | 7 | 11 | 64% |
| Forge app (app) | 0 | 7 | 0% |
| Rovo and Teamwork Graph | 0 | 4 | 0% |
| CI/CD and hosting | 4 | 6 | 67% |
| Submission | 0 | 4 | 0% |
| **Overall** | **22** | **49** | **45%** |
<!-- progress:end -->

The table counts the checkboxes under **Workstreams** and is rebuilt with `npm run progress:write` (CI fails if it is stale). Counts measure planned tasks, not effort.

## Resume here
Schedule check on 2026-11-06: 47 days to the Dec 23 deadline. The plan's Nov 1 to 8 window for setup and spikes is nearly used up and is still waiting on the Atlassian dev site, so that is the critical path.

Next actions, highest first:
1. **Soham:** create the Atlassian dev site, run `forge create`, share the `app.id` line, add the two GitHub secrets (see Blockers). Nothing Forge-side can start before this.
2. **Run spike S1** (`docs/SPIKES.md`), then fix `packages/core/src/normalize.ts` against real payloads.
3. **Visual review of the demo** in a real browser (not possible in the build sandbox): run `npm run dev -w @traceflow/demo`, check the three views at 1280 and 390 wide, then run Hallmark's render tier.
4. Connect the repo to Netlify (UI, no token) so the demo gets a public URL.
5. Move the shared UI into a package the Forge Custom UI can import, then wire Forge resolvers to the same `OrgGraph` adapter interface.

## Workstreams

### Planning and docs
- [x] Project plan with scope, decisions, architecture, timeline (`docs/PLAN.md`)
- [x] Progress index and agent entry point (`docs/PROGRESS.md`, `AGENTS.md`, `CLAUDE.md`)
- [x] Locked design system and product rules (`DESIGN.md`)
- [x] Validation spike guide (`docs/SPIKES.md`)
- [ ] Confirm the 2026 Codegeist rules, categories and exact deadline time on Devpost
- [ ] Draft the Devpost description and the demo script against the final feature set

### Core engine (packages/core)
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
- [ ] Change impact analysis (stretch)

### Demo UI (demo)
- [x] App shell with top bar and hash routing (state lives in the URL)
- [x] People view: ranking, handover ledger, evidence card
- [x] Epics view: lane diagram with linked-record highlighting and gaps
- [x] Decisions view: linked work, people and roles, findings
- [x] Loading, empty and error states, with `?demo=` switches
- [x] 12 UI tests (routing, ledger totals, evidence, the four states)
- [x] Hallmark static lint at 0 FAIL, 0 WARN
- [ ] Visual review in a real browser at desktop and phone widths
- [ ] Hallmark render-tier lint (needs a headless browser)
- [ ] Keyboard and screen-reader pass
- [ ] Netlify site connected with a public URL

### Forge app (app)
- [ ] App registered with `forge create` (needs Soham)
- [ ] S1: Jira and Confluence data in one resolver
- [ ] Resolvers returning `OrgGraph` through the adapter interface
- [ ] Custom UI wired to the shared components
- [ ] KVS caching with short TTLs, usage within free allowances
- [ ] Minimal manifest scopes
- [ ] First successful `forge deploy` from GitHub Actions

### Rovo and Teamwork Graph
- [ ] S2: Teamwork Graph echo and one real query (may need allowlisting)
- [ ] S3: Rovo agent installed and calling a Forge action
- [ ] On-demand agent action: top knowledge-continuity risks for a person or project
- [ ] `rovo:mcp` tools (stretch)

### CI/CD and hosting
- [x] CI: typecheck, tests, build on every push
- [x] Manual Forge deploy workflow (untested)
- [x] Netlify build config
- [x] Hallmark design lint and progress-table check wired into CI
- [ ] GitHub secrets `FORGE_EMAIL` and `FORGE_API_TOKEN` set
- [ ] Netlify connected to the repo

### Submission
- [ ] Marketplace listing or review ticket
- [ ] Demo video (about 5 minutes)
- [ ] Devpost entry with App ID and bonus categories declared
- [ ] Final README with install steps

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

## Blockers needing Soham
- Free Atlassian development site, `forge create`, and the `app.id` from `manifest.yml`.
- GitHub secrets `FORGE_EMAIL` and `FORGE_API_TOKEN`.
- Netlify: connect the repo from Netlify's UI.
- Devpost registration, and confirm the exact 2026 deadline time.
- **Revoke the GitHub token that was pasted into the chat in session 1** and create a fresh short-lived one for the next push session.
- If Teamwork Graph returns an authorization error, ask Atlassian support to allowlist the app ID (see S2).

## Session log (newest first)
- **2026-11-06, session 2.** Vendored Hallmark (MIT) and dealt the Coral theme at app scope. Built `demo/` (People ledger, Epics lane diagram, Decisions, evidence card, four states with `?demo=` switches, 12 UI tests, Hallmark lint at 0 FAIL and 0 WARN). Added `DESIGN.md`, `AGENTS.md`, `CLAUDE.md`, `docs/SPIKES.md`, this index with a generated progress table, the Netlify config, and CI steps for design lint and the progress check. Not done: anything needing Atlassian access, a real browser (no screenshots or render-tier lint), or Netlify.
- **2026-11-01, session 1.** Researched the direction and platforms (Forge hosting, free allowances, CI, Teamwork Graph Preview status); wrote `docs/PLAN.md`; pushed the first commit. Built `packages/core`: risk scoring and ranking, epic lineage, decision tracing, Jira and Confluence normalizers, rule text, richer fixtures, 29 tests.
