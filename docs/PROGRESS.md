# TraceFlow progress index

Last updated: 2026-11-08 (session 6). Read `AGENTS.md` first, and see `PRODUCTS.md` for what each workstream builds. This file is the resume point for any new session or agent: update it before you stop.

The engine's core architecture is now hardened end to end: one validated pipeline at every boundary, one shared index, canonical (order-stable) outputs, a deterministic answer layer with a grounding guard so no surface ever trusts an LLM for facts, and a 10-stage e2e harness in CI. See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).

<!-- progress:start -->
| Workstream | Tier | Done | Total | Complete |
| --- | --- | --- | --- | --- |
| Planning and docs | T1 | 5 | 7 | 71% |
| TF-02 Engine (packages/core) | T1 | 14 | 18 | 78% |
| TF-03 Workbench and public demo (packages/ui, demo) | T1 | 11 | 13 | 85% |
| TF-01 Forge app (app) | T1 | 3 | 7 | 43% |
| TF-04 Agent (Rovo) and Teamwork Graph | T1 | 1 | 5 | 20% |
| CI/CD and hosting | T1 | 6 | 9 | 67% |
| Submission | T1 | 0 | 4 | 0% |
| TF-05 Seeder and demo kit (tools/seeder) | T1 | 3 | 3 | 100% |
| TF-08 Site and docs (site) | T1 | 1 | 3 | 33% |
| TF-06 MCP server (packages/mcp) | T2 | 5 | 7 | 71% |
| TF-07 Check, the pull-request provenance gate (packages/check) | T2 | 4 | 6 | 67% |
| TF-09 Cloud, the standalone web app (apps/cloud) | T3 | 0 | 3 | 0% |
| TF-10 Connectors (packages/connectors) | T3 | 0 | 3 | 0% |
| TF-11 Impact, change impact analysis | T3 | 2 | 3 | 67% |
| TF-12 Promises | T3 | 0 | 2 | 0% |
| **Tier 1 (ships for the hackathon)** | T1 | **44** | **69** | **64%** |
| **All tiers** | all | **55** | **93** | **59%** |
<!-- progress:end -->

The table counts the checkboxes under **Workstreams** and is rebuilt with `npm run progress:write` (CI fails if it is stale). Counts measure planned tasks, not effort.

## Resume here
Schedule check on 2026-11-08: 45 days to the Dec 23 deadline. The engine is architecture-complete for the sandbox (validation pipeline, shared index, deterministic answers, grounding guard, e2e harness — session 6), the Workbench has five views, the MCP server exposes seven tools, the check gate is a tested CLI + Action, and the Forge scaffold, seeder and landing page are built. The critical path is still the two one-time setups: the Pages source flip and Atlassian access.

Next actions, highest first:
1. **Soham, one flip:** repo Settings → Pages → Build and deployment → Source: **GitHub Actions** (or add a fine-grained PAT with "Pages: Read and write" as the `PAGES_TOKEN` secret). Then re-run the failed Pages job or push anything: the landing page publishes at `https://soham-0047.github.io/traceflow/` and the demo at `/traceflow/demo/`. This setting cannot be changed by the workflow token or the current PAT — GitHub blocks both (verified: 403 for GITHUB_TOKEN and for a PAT without Pages write).
2. **Soham:** create the Atlassian dev site, run `forge register` in `app/`, put the app id in `app/manifest.yml` (replacing `REPLACE_AFTER_FORGE_REGISTER`), and add the `FORGE_EMAIL` / `FORGE_API_TOKEN` secrets. Everything Forge-side is scaffolded and unit-tested; `app/README.md` has the steps.
3. **Run spike S1** (`docs/SPIKES.md`), then fix `app/src/backend/graph.ts` and `packages/core/src/normalize.ts` against real payloads.
4. **TF-04 next:** wire the Rovo agent onto the deterministic answer layer — `answerQuery` + `groundedAnswer` are built and tested; the agent module only needs to call them and serve `AnswerResult.data` as the evidence JSON.
5. **Soham:** run the seeder against the dev site (`npm run seed -w @traceflow/seeder`, dry-run by default, `--apply` for real; needs the env vars in `tools/seeder/src/cli.ts`).
6. Manual screen-reader pass over the Workbench (NVDA or VoiceOver); the keyboard pass and the automated axe-core audit (in CI, now 15 checks including the Impact view) are done.

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
- [x] Change-impact module: what is left without a person (`personImpact`: stalled epics including epic ownership, lone work, orphaned pages, blocked decisions, unmerged changes) with `IMPACT_RULES` text
- [x] Sample fixtures and unit tests (99 across the core suites)
- [x] Runtime validation boundary for untrusted input (session 6): `validate.ts` with hard caps (bytes, records, strings, link lists), per-record issue paths, prototype-pollution guards, dangling-reference warnings; strict and best-effort modes
- [x] Shared `GraphIndex` + order-blind `graphFingerprint` (session 6): memoized per graph, all engines run on it, outputs canonical (order-stable) — shuffled input produces byte-identical analysis
- [x] Deterministic answer layer (session 6): `answerQuery` with six intents, evidence and caveats on every answer, honest `understood: false` with suggestions — the TF-04 backbone, no model involved
- [x] Grounding guard (session 6): `checkGrounding`/`groundedAnswer` verify LLM rephrasing against the answer's facts (people, record ids, numbers) and fall back to the deterministic answer on any violation
- [x] `runPipeline`/`analyzeAll` and the 10-stage e2e harness (`npm run e2e`, in CI) covering validation, determinism, engine facts, answers, grounding, MCP in-process and over stdio, and the check gate's exit codes
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
- [ ] Manual screen-reader pass (NVDA or VoiceOver); keyboard order, focus visibility and labels are done, and the automated axe-core audit (WCAG 2.x AA + best practices, 13 checks over every view and state) runs in CI
- [ ] Netlify site connected with a public URL (GitHub Pages is the canonical public URL meanwhile; see CI/CD)
- [x] Extract the UI into `packages/ui` (`Workbench`) so the Forge Custom UI can host it
- [x] Impact view: blast radius grouped by kind with per-kind counts, evidence drawer from every area, URL state (`#/impact/<person>/finding/<id>`, 5 UI tests)

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
- [x] Explainer interface so explanations come only from evidence JSON (session 6): the deterministic answer layer (`answerQuery`) produces the evidence JSON, and the grounding guard (`groundedAnswer`) is the contract any LLM phrasing must pass, with the deterministic answer as fallback; Rovo wiring itself waits on Forge access
- [ ] `rovo:mcp` tools (stretch, Best app with MCP)

### [T1] CI/CD and hosting
- [x] CI: typecheck, tests, build and the axe-core accessibility audit on every push
- [x] Manual Forge deploy workflow (untested)
- [x] Netlify build config
- [x] Hallmark design lint and progress-table check wired into CI
- [x] GitHub Pages workflow (`pages.yml`: landing page at `/`, demo at `/demo/`, no secrets)
- [x] End-to-end harness in CI (session 6): `npm run e2e` runs after build — 10 stages including the MCP CLI over stdio and the check gate's exit codes as real subprocesses
- [ ] GitHub Pages published: the build job is green and the artifact verified; one one-time flip remains (Source: GitHub Actions in repo settings, or a Pages-write PAT as `PAGES_TOKEN`) — the workflow token and the current PAT both get 403 on the Pages settings API
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
- [ ] Public URL on the README (live since session 4) and, later, Devpost

### [T2] TF-06 MCP server (packages/mcp)
- [x] Server on the official `@modelcontextprotocol/sdk` with six tools (`list_people`, `person_risk`, `person_impact`, `epic_lineage`, `decision_trace`, `overview`), truth rules in every description, over any `DataAdapter` (sample fixtures by default, `TRACEFLOW_GRAPH` export via env)
- [x] Protocol-level tests: a real `Client` over the SDK's `InMemoryTransport` (9 tests: tool listing, prefix resolution, evidence in results, helpful failures, custom adapter)
- [x] README with client configuration (Claude Desktop snippet)
- [x] `traceflow_query` tool (session 6): deterministic, model-free answers over the answer layer, with truth rules and the answerable-question list in the description; 13 protocol tests
- [x] Every source validated through the pipeline (session 6): `validatedSource` runs best-effort, logs warnings and quarantine notices to stderr once, caches the sanitized graph; the CLI parses `TRACEFLOW_GRAPH` strictly and lists every issue on corrupt exports
- [ ] Real-site adapter (waits on the Forge app or an API-token source)
- [ ] `rovo:mcp` exposure inside the Forge app (ties to TF-04 and the MCP prize)

### [T2] TF-07 Check, the pull-request provenance gate (packages/check)
- [x] CLI gate on an OrgGraph export: fail when no work item links to the PR (no provenance) or linked work implements a superseded decision; proposed decisions pass; every reason carries evidence; `--json` and exit codes 0/1/2 (9 tests: gate rules + CLI contract)
- [x] GitHub Action wrapper (composite action, self-contained esbuild bundle committed at `packages/check/dist/cli.js`)
- [x] Export parsing through the strict validation pipeline (session 6): corrupt exports exit 2 with per-record issue paths — a gate never runs on silently-broken data (11 tests)
- [x] Gate exercised end to end in the e2e harness (session 6): the bundled CLI as a subprocess on a fixture-generated export, exit codes 0/1/2 verified, corrupt export refused with paths
- [ ] Run the Action in this repo's own CI on a live-app export
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
Promoted from T3 by Soham's instruction in session 5 (D25); the person blast radius shipped.
- [x] Engine module that traverses the graph for a changed person (`personImpact` in `packages/core`, 5 tests)
- [x] Impact view in the Workbench (`packages/ui`, 5 UI tests, in the a11y audit set)
- [ ] Impact for a changed decision or epic (roadmap)

### [T3] TF-12 Promises
- [ ] Commitment detection in Confluence notes
- [ ] On-demand Rovo skill that offers to create and link a Jira issue

## Verified vs unverified
Verified (run in the build sandbox, session 6): 159 tests (99 core, 20 UI, 13 MCP, 11 check, 4 demo, 7 app, 5 seeder), typecheck and build across all workspaces, the Forge Custom UI frontend builds with vite, the MCP server answered a real JSON-RPC handshake, tools/list and a tools/call over stdio from its built CLI, the check gate's bundled CLI produced correct verdicts and exit codes (0/1/2) on pass, fail and error cases, Hallmark static lint 0 FAIL 0 WARN (app scope) and 0 FAIL 0 REFLEX 0 WARN (page scope), the Hallmark **render tier** run with a headless browser at 320 to 1920px over both the site and the demo views, a visual review of all views at 1280 and 390, a keyboard pass (tab order, focus visibility, skip link), an **axe-core accessibility audit** (WCAG 2.x AA + best practices; 15 checks: the landing page and every demo view including Impact and forced state at 1280 and 390, `npm run a11y`, also a CI gate), contrast of the muted token on paper at 14.2:1, and no console errors or horizontal overflow on any checked page. **New in session 6** (`npm run e2e`, also a CI gate): all 10 end-to-end stages green — strict validation of the fixtures, corrupt-export quarantine and refusal with issue paths, byte-identical analysis under shuffled input (determinism), the sample story's known engine facts, six answer intents with evidence, grounding accept/reject/fallback, seven MCP tools over InMemoryTransport, the **built MCP CLI over stdio as a subprocess** answering a real JSON-RPC handshake and tools/call, the **bundled check CLI as a subprocess** returning exit codes 0/1/2 on pass/fail/data-error, and a synthetic 7,150-record org analyzed cold in ~120 ms inside CI-safe budgets (performance smoke also in `pipeline.test.ts`).

Unverified: everything that touches Atlassian (Forge runtime behaviour, manifest validity, REST payload shapes, KVS call shapes, Rovo, the seeder's REST calls against a real site), Netlify, the Pages **deploy** step (the build job and artifact are verified; the deploy step waits on the source flip above), and the check Action inside a real consumer workflow (the composite step and the bundled CLI are tested locally and now in the e2e harness, action.yml follows the documented composite-action contract).

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
| D23 | Pages needs a one-time source flip that no workflow token can do: the deploy job checks `build_type` and, when it is not `workflow`, tries the settings API with `PAGES_TOKEN` (if provided) and otherwise fails with the exact two fixes | Verified empirically: `PUT /repos/…/pages` → 403 for the Actions GITHUB_TOKEN and for the PAT without Pages write; GraphQL has no Pages mutations. `deploy-pages` 404s while the site is on the legacy branch source |
| D24 | The accessibility gate is axe-core (WCAG 2.x AA + best practices) over Playwright Chromium, 13 checks in CI; on GitHub runners it falls back to the preinstalled system Chrome | Automated half of the a11y pass; the manual screen-reader pass (NVDA/VoiceOver) is still owed |
| D25 | TF-11 (Impact) is promoted from T3 to now, and TF-06/TF-07 (T2) are started, on Soham's session-5 instruction to "implement more features" | All three are fully verifiable in the sandbox with no Atlassian access; T1 remains the critical path |
| D26 | The MCP server is built on the official `@modelcontextprotocol/sdk` with six `traceflow_*` tools over the `DataAdapter` contract; every tool description carries the truth rules | Protocol-level tests over `InMemoryTransport`; `rovo:mcp` (the Codegeist MCP prize) reuses the same tools inside Forge later |
| D27 | The check gate fails only on a missing work-item link or a superseded decision; a proposed decision passes (work may start while approval is pending), and the Action consumes a committed esbuild bundle so no install step is needed | `packages/check/action.yml`; exit codes 0 pass / 1 verdict-fail / 2 usage |
| D28 | Every surface goes through one pipeline: `runPipeline` (strict for exports and gates — never silently lose a record that could change a verdict; best-effort for live sources — quarantine and warn) with hard input caps, per-record issue paths and prototype-pollution guards at the boundary; engine outputs are canonical (order-stable) so shuffled input yields byte-identical analysis | Session 6, on Soham's "fast, reliable and secure core architecture" instruction; `docs/ARCHITECTURE.md`, `packages/core/src/validate.ts`, `pipeline.ts` |
| D29 | The agent backbone is deterministic: `answerQuery` maps questions to six intents with evidence and honest misses, no model involved; an LLM may only rephrase an `AnswerResult`, and only through `groundedAnswer`, which lexically verifies people, record ids and numbers against the answer's facts and falls back to the deterministic text on any violation | Session 6, on Soham's "don't just totally rely upon LLM output" instruction; `packages/core/src/query.ts`, `grounding.ts`; the lexical guard's limits are documented in source |
| D30 | `npm run e2e` (10 stages, in `verify` and CI after build) is the definition of "each pipeline checked end to end": it drives real boundaries, including the MCP CLI over stdio and the check CLI's exit codes as subprocesses, not just in-process function calls | Session 6; `scripts/e2e.mjs` |

## Blockers needing Soham
- **Pages source flip (one click):** repo Settings → Pages → Build and deployment → Source: **GitHub Actions**, then re-run the failed Pages job. Alternative: a fine-grained PAT with "Pages: Read and write" stored as the `PAGES_TOKEN` secret, and every run self-heals. Neither the workflow token nor the current PAT can change this setting (403).
- Confirm that "any tech stack" does not also relax the $0 budget (assumed it does not).
- Free Atlassian development site, `forge register`, and the real app id in `app/manifest.yml`.
- GitHub secrets `FORGE_EMAIL` and `FORGE_API_TOKEN`.
- Netlify (optional now that Pages is the canonical URL): connect the repo from Netlify's UI.
- Devpost registration, and confirm the exact 2026 deadline time.
- **Revoke the GitHub token that was pasted into the chat once this session is pushed** and create a fresh short-lived one for the next push session.
- If Teamwork Graph returns an authorization error, ask Atlassian support to allowlist the app ID (see S2).

## Session log (newest first)
- **2026-11-08, session 6, latest.** The core-architecture hardening sprint, on Soham's "fast, reliable and secure, don't just totally rely upon LLM output, check each pipeline end to end" instruction. **Validation boundary** (`validate.ts`): every input crossing into the engine — exports, env sources, the Forge-built graph, future connectors — is validated with hard caps (50 MB JSON, per-collection and total record caps, string and link-list caps), per-record issue paths (`$.workItems[11].status`), control-character and `__proto__`/`constructor`/`prototype` key rejection, and dangling-reference warnings; `sanitizeGraph` quarantines bad records and drops dangling refs without ever mutating the input (a mutation bug caught by the new double-call test and fixed). **Pipeline** (`pipeline.ts`): `runPipeline` strict (refuse, list every issue — exports and gates) and best-effort (quarantine and warn — live sources); `analyzeAll` for e2e. **Speed** (`graph-index.ts`): a `GraphIndex` of forward and reverse maps memoized per graph via WeakMap, shared by every engine function; engines refactored onto it with canonical output ordering (evidence by id, people by id, epic children by id), so shuffled input produces byte-identical analysis; an order-blind, url-blind `graphFingerprint` (two-lane FNV-1a, no platform crypto) for caches. **No-LLM-trust made architectural** (`query.ts`, `grounding.ts`): `answerQuery` answers six intents deterministically with evidence and honest misses (unknown person, ambiguity, empty graph all handled); `groundedAnswer` lexically verifies any LLM rephrasing against the answer's facts and falls back to the engine's own words on violation. **Surfaces rewired**: MCP gained `traceflow_query` (seven tools now) and `validatedSource` (pipeline + warnings to stderr + cached sanitized graph; the CLI parses `TRACEFLOW_GRAPH` strictly with issue lists); the check CLI parses exports through the strict pipeline (corrupt export → exit 2 with paths); the Forge resolver sanitizes the site graph best-effort. **E2E harness** (`scripts/e2e.mjs`, D30): 10 stages in `verify` and CI, driving real subprocesses — the MCP CLI over stdio with a hand-rolled JSON-RPC client, and the bundled check CLI's exit codes on pass/fail/data-error. En route: a sanitize input-mutation bug found and fixed; `traceEpic` now rejects non-epic ids. Verified: 159 tests (was 97), the 10 e2e stages green, 7,150-record perf smoke cold ~120 ms, typecheck/build/lints/a11y unchanged.
- **2026-11-07, session 5.** The engine satellites sprint, on Soham's "implement more features" instruction: one engine, three new surfaces. **TF-11 Impact** (promoted from T3, D25): `personImpact` in core — the blast radius of one person as evidence-backed areas (stalled epics, where owning the epic record itself counts; lone un-epicked work; orphaned sole-contributor pages; blocked decisions, split by owner vs outstanding approver; unmerged changes), 5 tests, plus a fifth Workbench view with per-kind counts, an evidence drawer from every row and full URL state (5 UI tests). **TF-06 MCP server** (`packages/mcp`, D26): six `traceflow_*` tools on the official `@modelcontextprotocol/sdk` over the same `DataAdapter` contract (sample fixtures by default, any OrgGraph export via `TRACEFLOW_GRAPH`); truth rules in every tool description; 9 protocol-level tests with a real `Client` over `InMemoryTransport`; the built CLI answered a real JSON-RPC handshake, tools/list and a person_impact tools/call over stdio. **TF-07 Check** (`packages/check`, D27): the pull-request provenance gate — fail on no linked work item or a superseded decision, pass on proposed; evidence under every reason; `--json`, exit codes 0/1/2; 9 tests (gate rules + CLI contract); composite GitHub Action (`action.yml`) consuming a committed self-contained esbuild bundle; the bundled CLI verified end-to-end on pass/fail/usage cases. Fixed en route: epic records were first counted as un-epicked work — epics are containers, and epic ownership now yields its own stalled-epic signal; `.gitignore` exception commits the check bundle; the a11y audit set grew to 15 checks with the Impact view; esbuild resolves core via tsconfig paths so the bundle never depends on build order. Verified: 97 tests, typecheck, build, both lint tiers, a11y clean, stdio and CLI smoke tests.
- **2026-11-07, session 4, latest.** Diagnosed and hardened the Pages deployment. Root cause of `deploy-pages` → HttpError: Not Found: the Pages site was still on the **legacy branch source**, and the setting cannot be flipped programmatically — verified 403 for the Actions GITHUB_TOKEN ("Resource not accessible by integration"), 403 for the fine-grained PAT (Pages write not granted), and no Pages mutations exist in GraphQL. `pages.yml` now checks `build_type` before deploying, tries `PAGES_TOKEN` when that secret exists, and otherwise fails with the exact two fixes instead of the cryptic 404; the build job and artifact are verified green in CI. Built the accessibility gate that session 3 owed: `scripts/a11y.mjs` runs axe-core (WCAG 2.x AA + best practices) in headless Chromium over the landing page and every demo view and forced state at 1280/390 — 13 audits, wired into CI and `npm run verify` (D24), falling back to the runner's system Chrome. It found 6 violations, all fixed: the landing ledger's scroll region is keyboard-focusable with a label, the loading/empty/error panels now carry a real h1 (the skeleton gets a visually-hidden one), lane labels moved h3→h2 to keep the heading order, and the three dangling `aria-labelledby` main sections got static labels. Verified: 69 tests, typecheck, build, both lint tiers, 13 a11y audits clean, computed-style parity for the changed headings, no horizontal overflow at either width.
- **2026-11-07, session 3, latest.** Overview end to end: `buildOverview` in core (ranked epics, org health counts, coverage) with 6 tests, and a new Overview view as the default landing page (15 UI tests total). Forge app scaffolded in `app/` (manifest with placeholder id, `getGraph` resolver with a unit-tested KVS TTL cache, Custom UI hosting the Workbench, forge adapter with mocked `@forge/bridge` tests, 7 app tests). Seeder in `tools/seeder` (sample story from the fixtures, idempotent planner with 5 tests, dry-run CLI). Landing page in `site/` (Hallmark page flow, Coral page variant locked in `DESIGN.md`, clean on static and render tiers). Hosting: `pages.yml` publishes site + demo to GitHub Pages (D17); `forge-deploy.yml` now refuses the placeholder app id. Real-browser review of every view at 1280/390 with the four states: fixed the double-spaced overview rhythm, fanned the lane connectors out from per-edge anchors (D22), made the ledger scroll with a swipe hint on phones (D19), tightened mobile tables. Render tier run for the first time (site and demo) and brought to 0 FAIL 0 WARN. All checks green: 69 tests, typecheck, build, both lint tiers.
- **2026-11-06, session 2, latest.** Extracted the UI into `packages/ui` (`Workbench`, props for source note and footer), made `demo/` a thin host with its own adapter tests, retargeted design lint, wrote `docs/demo-script.md` and `packages/ui/README.md`. All checks green: 29 core, 12 UI and 4 demo tests, build, lint.
- **2026-11-06, session 2, later.** Wrote `PRODUCTS.md`: twelve products in three tiers, the shared contracts, stack defaults, prize mapping and rules for parallel agents. Progress table now reports Tier 1 separately from all tiers. No product code written; T2 and T3 are briefs only.
- **2026-11-06, session 2.** Vendored Hallmark (MIT) and dealt the Coral theme at app scope. Built `demo/` (People ledger, Epics lane diagram, Decisions, evidence card, four states with `?demo=` switches, 12 UI tests, Hallmark lint at 0 FAIL and 0 WARN). Added `DESIGN.md`, `AGENTS.md`, `CLAUDE.md`, `docs/SPIKES.md`, this index with a generated progress table, the Netlify config, and CI steps for design lint and the progress check. Not done: anything needing Atlassian access, a real browser (no screenshots or render-tier lint), or Netlify.
- **2026-11-01, session 1.** Researched the direction and platforms (Forge hosting, free allowances, CI, Teamwork Graph Preview status); wrote `docs/PLAN.md`; pushed the first commit. Built `packages/core`: risk scoring and ranking, epic lineage, decision tracing, Jira and Confluence normalizers, rule text, richer fixtures, 29 tests.
