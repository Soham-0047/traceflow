# TraceFlow products

The one place that lists everything we are building. If you are an agent picking up work, start with the tier table, take one product section, and follow its "Done when". Status lives in [`docs/PROGRESS.md`](docs/PROGRESS.md); this file says *what exists and why*.

## The idea

**TraceFlow reveals the hidden dependencies inside an organization: who and what a piece of work depends on, why a decision was made, and what breaks when something or someone changes.** Every answer is backed by records the user can open (evidence first), and AI only explains what the records already show.

The platform is one shared engine, a few surfaces that show it, and some satellites that feed it or reuse it:

```
 sources                    engine                      surfaces and satellites
 ───────                    ──────                      ───────────────────────
 Jira, Confluence ─┐                                   ┌─ TF-01 Forge app (Codegeist entry)
 Bitbucket        ─┤                                   ├─ TF-03 Workbench UI and public demo
 Teamwork Graph   ─┼─► TF-10 connectors ─► OrgGraph ─► TF-02 Engine ─┼─ TF-04 Rovo agent
 GitHub, Slack,   ─┤    (DataAdapter)      (the one    (pure TS)     ├─ TF-06 MCP server
 Drive, Compass   ─┘                        contract)                ├─ TF-07 Check (CI gate)
                                                                     ├─ TF-09 Cloud (standalone)
                                                                     └─ TF-11 Impact, TF-12 Promises
 TF-05 Seeder fills a dev site with the demo story · TF-08 Site and docs tell it
```

## Tiers: what to work on first

| Tier | Meaning | Rule |
| --- | --- | --- |
| **T1** | Ships for Codegeist 2026. Submit by **Dec 21**, deadline Dec 23. | Everything else waits for these. |
| **T2** | Reinforces the submission or unlocks a bonus prize. | Start only if it helps T1, or Soham asks. |
| **T3** | Roadmap after the hackathon. Briefs only. | No code before Dec 21 unless Soham asks. |

| ID | Product | Tier | Status | Stack | Lives in |
| --- | --- | --- | --- | --- | --- |
| TF-01 | TraceFlow for Atlassian (Forge app) | T1 | Scaffolded and unit-tested; UNVERIFIED until deployed (needs `forge register`) | Forge, Custom UI (React, TS) | `app/` |
| TF-02 | TraceFlow Engine | T1 | v1.1: overview aggregates added; 38 tests | TypeScript, no runtime deps | `packages/core` |
| TF-03 | TraceFlow Workbench (shared UI and public demo) | T1 | Reviewed in a real browser at two widths; render-tier lint clean; keyboard pass and axe-core a11y gate in CI done; manual screen-reader pass owed | React 18, TS, Vite | `packages/ui`, `demo/` |
| TF-04 | TraceFlow Agent (Rovo agent, actions, optional MCP tools) | T1 | Not started | Forge `rovo:*` modules | `app/` |
| TF-05 | TraceFlow Seeder (demo data and video kit) | T1 | Planner written and unit-tested; REST apply UNVERIFIED until a real run | Node, TS, Atlassian REST | `tools/seeder` |
| TF-08 | TraceFlow Site and docs | T1 | Built, lint clean on both tiers, a11y gate in CI; public URL waits on the one-time Pages source flip | Static site | `site/` |
| TF-06 | TraceFlow MCP (standalone server for any AI agent) | T2 | Not started | TS, MCP SDK | `packages/mcp` |
| TF-07 | TraceFlow Check (provenance gate for pull requests) | T2 | Not started | Node CLI, GitHub Action, Bitbucket Pipe | `packages/check` |
| TF-09 | TraceFlow Cloud (standalone web app) | T3 | Not started | TS full stack | `apps/cloud` |
| TF-10 | TraceFlow Connectors (more sources) | T3 | Not started | TS packages | `packages/connectors/*` |
| TF-11 | TraceFlow Impact (change impact analysis) | T3 | Not started | Engine module and UI view | `packages/core`, `demo` |
| TF-12 | TraceFlow Promises (commitments without tickets) | T3 | Not started | Rovo skill, engine module | `packages/core`, `app/` |

## Prize mapping (from `Resources` in the project files)

| Prize | Carried by | What must be true |
| --- | --- | --- |
| Apps for Software Teams (main category) | TF-01, TF-03 | Installable Forge app solving a real engineering-team problem |
| Best Agents (Rovo and assignable agents) | TF-04 | App ships a `rovo:agent` or reusable `rovo:skill` and `rovo:action` modules |
| Best app with MCP | TF-04 | Forge app exposes tools through `rovo:mcp` (TF-06 is separate and does not count by itself) |
| Best Teamwork Graph integration | TF-01 with TF-02's adapter | App consumes the Teamwork Graph API (spike S2, may need allowlisting) |
| Best Marketplace published app | TF-01 | Listing link or review ticket in the Devpost entry |

## Shared contracts (do not break these casually)

- **`OrgGraph`** (`packages/core/src/types.ts`): people, work items, pages, pull requests, decisions, each with a `RecordRef` (source, id, title, url). Every source produces it, every surface consumes it.
- **`DataAdapter`** (`packages/core/src/adapter.ts`): `loadGraph(): Promise<OrgGraph>`. Connectors implement it; surfaces never fetch Atlassian data directly.
- **Reports**: `PersonRiskReport`, `LineageReport`, `DecisionReport`, all built from `Finding` (kind, title, detail, confidence, `evidence[]`, points, suggested actions) plus `caveats[]`.
- **Change rules**: additive changes are fine. A breaking change needs an entry in the decision log and the same pull request must update every consumer and its tests. Never add a field a surface cannot explain with a record.
- **Truth rules**: findings come from records, not from a model. A missing link means "not found in the connected data", never "does not exist". Do not flag what the connected sources cannot show.

## Stack decisions (any stack is allowed; these are the defaults)

| Layer | Default | Why | Changing it |
| --- | --- | --- | --- |
| Language | TypeScript | One language across Forge, UI, CLI and MCP, so the engine is shared as-is | Fine for a satellite with a reason (for example Python for data work). Add a decision-log entry |
| Repo | npm workspaces | Already in place | Move to pnpm or Turborepo only if build time hurts |
| UI | React 18, Vite, Hallmark tokens (`DESIGN.md`) | Forge Custom UI compatible, one design system | Marketing pages use Hallmark's page flow, not the app scope |
| Forge products | Forge runtime, Custom UI, KVS | Required for TF-01 and TF-04 | Not negotiable for the Codegeist entry |
| Standalone backend (T3) | Proposal: Hono on Cloudflare Workers with D1 and cron triggers | TypeScript, free tier, no cold-start sleep. Verify free-tier limits and commercial terms before committing | Alternatives: Node and SQLite on a small host |
| AI explanations | A provider-agnostic `Explainer` interface; Rovo inside Forge; no keys in the repo | Keeps $0 and keeps findings deterministic | A free-tier API or a local model for development, behind the same interface |
| Tests | Vitest and Testing Library; contract tests for every adapter; Playwright when a browser exists | Already in place | Every new engine rule needs a test |
| CI and hosting | GitHub Actions; Forge; Netlify for static sites; npm and GitHub Releases for packages | $0 | Cost changes need Soham's approval |

Budget is still **$0** unless Soham says otherwise: "any stack" is read as freedom of technology, not of spend.

## Products

Each section is written so one agent can start from it alone.

### TF-01 TraceFlow for Atlassian (Forge app)
- **What:** the flagship and the Codegeist entry. A Jira issue panel and a global page where a user investigates a person, an epic or a decision and gets the evidence card. Runs entirely on Forge.
- **For:** engineering leads, managers and delivery owners who need to know what depends on whom, especially around someone leaving.
- **Depends on:** TF-02, TF-03, and spike S1 (`docs/SPIKES.md`).
- **Build:** Forge resolvers call Jira and Confluence (`requestJira`, `requestConfluence`), build an `OrgGraph` through the normalizers, run the engine, cache in KVS with short TTLs. The Custom UI reuses TF-03 components. Deploy from GitHub Actions.
- **Done when:** installed on a dev site; People and Epic investigations work on real data with the evidence card; usage stays within Forge free allowances; App ID ready for Devpost.
- **First tasks:** Soham runs `forge register`, puts the app id in `app/manifest.yml` and sets the two GitHub secrets; deploy; run S1 and fix `app/src/backend/graph.ts` against real payloads. The resolver, KVS cache, Custom UI and forge adapter are already scaffolded and unit-tested.
- **Risks:** cross-product access, Teamwork Graph allowlisting, external fonts blocked inside Forge (egress for the font CDNs is declared in the manifest).

### TF-02 TraceFlow Engine (`@traceflow/core`)
- **What:** the pure library behind everything: risk scoring with visible weights, epic lineage, overview aggregates, decision tracing, Jira and Confluence normalizers, rule text, sample fixtures.
- **Contract:** no I/O, deterministic, no runtime dependencies, ESM. Input is an `OrgGraph`, output is a report with evidence and caveats.
- **Done when:** normalizers are validated against real payloads (S1), Teamwork Graph and Bitbucket mappings exist (S2, S4), the schema is documented here.
- **Next:** validate against real payloads (S1), then the T3 impact module.

### TF-03 TraceFlow Workbench (shared UI and public demo)
- **What:** the investigation UI: people ranked by risk, handover ledger (records × weight = points), lane-diagram lineage, decisions, evidence card, four states everywhere. The sample-data build is the public demo.
- **Stack and rules:** React 18, Vite, Hallmark Coral tokens at app scope; read `DESIGN.md` first. Components take a `DataAdapter` or reports through props and never fetch directly.
- **Where:** the UI is `<Workbench adapter={...} />` in `packages/ui` (see its README); `demo/` is a thin host on sample data. The Forge Custom UI will be a second host.
- **Done when:** a real-browser visual review passed at desktop and phone widths, Hallmark render-tier lint ran, an accessibility pass is done, the Forge Custom UI hosts the same component, Netlify serves a public URL.
- **Risks:** no browser was available when it was built, so it has never been looked at.

### TF-04 TraceFlow Agent (Rovo)
- **What:** a Rovo agent that answers "what are the top knowledge-continuity risks for person X or project Y?" using Forge actions that call the engine and return record links. Optional `rovo:mcp` tools expose the same investigations to other agents.
- **Rule:** the agent explains and recommends from the evidence JSON only; it never invents a record. Explanations go through the `Explainer` interface.
- **Done when:** installed on the dev site and answering with links (S3); optionally an MCP tool listed.
- **Prizes:** Best Agents, Best app with MCP.

### TF-05 TraceFlow Seeder (demo data and video kit)
- **What:** an idempotent script that fills a dev Atlassian site with the demo story (an engineer leaving, three epics, linked pages and decisions) so the demo video shows rich, believable data. Plus the demo script and shot list in `docs/demo-script.md`.
- **Needs:** Atlassian API token (Soham, kept out of the repo); fictional people mapped onto the few real accounts the dev site has.
- **Done when:** one command reproduces the story from scratch; the five-minute script matches the on-screen data.

### TF-08 TraceFlow Site and docs
- **What:** the public front door and judge guide: pitch, how it works, install steps, demo link, video, honest-wording notes. Static, on Netlify.
- **Rule:** this is a marketing page, so it follows Hallmark's page flow (not the app scope) and a locked variant in `DESIGN.md`. No invented metrics, testimonials or logos.
- **Done when:** public URL linked from Devpost and the README.

### TF-06 TraceFlow MCP (standalone)
- **What:** an MCP server that lets any AI agent (Claude, Cursor, Codex) call the engine: `assess_person_risk`, `trace_epic`, `trace_decision`, `list_people_by_risk`. Runs on fixtures or, with an API token, on a real site.
- **Why:** it makes the engine usable by the agents working on this repo and shows the evidence-first approach to a wider audience.
- **Done when:** a desktop agent lists and calls the tools on sample data; README has the config. It does not count for the MCP prize unless the Forge app also exposes `rovo:mcp`.

### TF-07 TraceFlow Check (provenance gate for pull requests)
- **What:** a CLI, a GitHub Action and a Bitbucket Pipe. Given a pull request, extract the Jira key, fetch the issue and its linked pages and decisions, and report the chain from intent to change. Warn or fail when no specification or decision is linked.
- **Why:** it carries the original "pull request to Jira to Confluence" idea into CI and reuses the lineage engine. Wording stays "audit-ready evidence", never "SOC 2 proof".
- **Done when:** runs offline on fixtures in this repo's CI; runs against a real site with secrets; posts a readable comment.

### TF-09 TraceFlow Cloud (standalone web app, T3)
- **What:** a web app outside Forge: Atlassian OAuth 2.0 (3LO), many sites, scheduled syncs, snapshots so risk can be shown over time.
- **Trade-offs:** reaches teams that cannot install a Forge app, but loses "runs on Atlassian" and adds security and review obligations.
- **Brief for later:** Hono on Cloudflare Workers and D1 (verify limits), TF-03 components, TF-10 connectors.

### TF-10 TraceFlow Connectors (T3)
- **What:** more sources behind `DataAdapter`: GitHub (pull requests linked by issue key), Bitbucket, Slack or Teams (decision threads), Google Drive or Notion (documents as pages), Compass (components and owners).
- **Rule:** each connector ships a contract test that feeds recorded payloads and asserts a valid `OrgGraph`.

### TF-11 TraceFlow Impact (T3)
- **What:** change impact analysis: when a decision changes, an epic's scope changes or a person leaves, which work, documents and people are affected, ranked, with "who needs to know". Traverses the lineage graph; same evidence rules.

### TF-12 TraceFlow Promises (T3)
- **What:** find explicit commitments in Confluence meeting notes ("we will ship OAuth by Nov 15") that have no Jira issue, and offer to create and link one. On-demand Rovo skill first; scheduled scanning only after that works.

## Working in parallel (for every agent)

1. **Read first:** `AGENTS.md`, `docs/PROGRESS.md`, this file, then your product section.
2. **Claim before you start:** add `Claimed by: <agent or person>, <date>` under your workstream in `docs/PROGRESS.md` in your first commit. Remove it when you finish or stop.
3. **Branches and pull requests:** work on `agent/<product-id>-<topic>`, open a small pull request into `main`, and keep `main` green (`npm run verify`). Rebase before merging.
4. **Stay in your lane:** change your product's directory. Shared contracts follow the change rules above; touching `packages/core/src/types.ts` or `DataAdapter` means updating every consumer and its tests in the same pull request.
5. **Progress file etiquette:** edit only your workstream and your own session-log line, then run `npm run progress:write`.
6. **Tier discipline:** T1 first. T2 only when it helps T1 or Soham asks. T3 stays as briefs until after Dec 21.
7. **Design:** any UI follows `DESIGN.md` and Hallmark, and `npm run lint:design` stays clean.
8. **Secrets and identity:** the repo is public, so no tokens or `.env` files. Commits are authored as `Soham-0047 <87080389+Soham-0047@users.noreply.github.com>`.
9. **Hand off:** end every session by updating "Resume here", the checkboxes and the session log in `docs/PROGRESS.md`.

## Out of scope for now

Replacing Jira or Confluence; auto-approving or auto-changing records; ranking individual employees' performance (TraceFlow shows what depends on a person, not how good they are); any claim of compliance certification.
