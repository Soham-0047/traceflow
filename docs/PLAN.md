# TraceFlow — Project Plan

> Status: v1 · written 2026-11-01 · owner: Soham-0047
> The product catalog is in [`/PRODUCTS.md`](../PRODUCTS.md). Living status, decisions made since, and next actions are in [`docs/PROGRESS.md`](PROGRESS.md). This plan covers the hackathon product (TF-01 to TF-05, TF-08); the tech stack is open for other products (PROGRESS D13). Design rules are in [`/DESIGN.md`](../DESIGN.md). Agents start at [`/AGENTS.md`](../AGENTS.md).
> Target: Atlassian **Codegeist 2026** (deadline **Dec 23, 2026** per the project docs; the 2025 cutoff was 10:00 AM PT, so confirm the exact 2026 time on Devpost and aim to submit by **Dec 21**).

## 1. Positioning

**TraceFlow reveals the hidden dependencies inside an engineering organization — connecting people, decisions, projects and documentation — so knowledge gaps are found before they become business problems.**

Initial product: **Knowledge Risk & Decision Lineage**. Expansion path: Change Impact Analysis.

Wording rules (do not break these in the UI, README, video or Devpost text):

- Say **"audit-ready evidence"** and **"decision traceability"**. Never "SOC 2 proof" or "compliance in one click".
- Say **"sole contributor"**, never "sole knowledge holder". Atlassian activity data cannot prove who understands something.
- Never promise "unlimited $0". Say "designed to stay within Forge's free monthly allowances".

## 2. Scope

| Area | MVP (must ship) | Stretch | Deferred |
|---|---|---|---|
| Investigation: **Person** | Open work, sole-contributor pages, pending decisions, suggested actions | Open PRs (needs Bitbucket spike) | — |
| Investigation: **Project (Jira epic)** | Epic → linked Confluence pages → child issues, weakly-connected evidence | Bitbucket PR nodes | — |
| Investigation: **Decision (Confluence page)** | Linked Jira issues, people involved | Superseded/conflicting references | — |
| **Evidence Drawer** | What was found, why flagged, supporting records, confidence, suggested action | — | — |
| **Rovo agent** | On-demand: "top knowledge-continuity risks in project X" | `rovo:mcp` tools for third-party agents | Background scanning |
| **Teamwork Graph** | Enrichment (e.g. page contributors), behind a feature flag | — | Making it the only data source |
| PromiseGuard (meeting-note commitments) | — | — | Entire feature |
| SME routing / friction heatmaps | — | — | Entire feature |

Principles: records are the source of truth; AI only explains and suggests; start with engineering orgs; no giant default node graph — the homepage is an investigation dashboard.

## 3. Key decisions

| # | Decision | Why |
|---|---|---|
| D1 | Build on **Jira + Confluence REST** first; Teamwork Graph is an enrichment layer behind a flag | Teamwork Graph is in Forge **Preview**, read-only, and org admins can toggle each scope; docs still carry a test-organizations-only warning. Core must not collapse if it changes |
| D2 | **Bitbucket is a spike, not a promise** | No verified supported path yet for a Jira/Confluence-installed Forge app to read PRs |
| D3 | Rovo agent is **on-demand** (user-invoked action) | A Rovo agent is not a background monitor; scheduled/event triggers can come later |
| D4 | **The Codegeist app (TF-01, TF-04) runs entirely on Forge** (functions, KVS, Custom UI); other products may use any stack | Keeps data on Atlassian (the "Runs on Atlassian" bonus existed in 2025), no external backend to host or pay for |
| D5 | **Pure-TypeScript core** (`packages/core`) with a data-adapter interface | Testable without Atlassian access; the same UI can run on mock data (Netlify demo) or Forge data |
| D6 | **No external LLM key.** Risk scoring is deterministic; Rovo provides the AI | $0, no secrets, and findings are explainable |
| D7 | ~~`@xyflow/react` for graphs~~ **Superseded (PROGRESS D9):** lineage is an HTML lane diagram with an SVG connector layer | Fewer dependencies, accessible, testable. If a real graph is needed later, use `@xyflow/react`, not `react-flow-renderer` |
| D8 | Optional graph view only inside an investigation, never the homepage | Business users need answers, not hundreds of nodes |

## 4. Architecture

```
 Jira ── Confluence ── (Bitbucket, after spike) ── Teamwork Graph (flagged)
        │ Forge REST / requestTeamworkGraph
        ▼
 ┌──────────────────────── Forge (Atlassian-hosted) ────────────────────────┐
 │  resolvers (functions)  →  packages/core  →  Forge KVS (cache + results) │
 │        ▲                                                                  │
 │        │ @forge/bridge invoke                                             │
 │  Custom UI (React + TS + Atlaskit + @xyflow/react)                        │
 │  Rovo agent + actions  →  same resolvers / core                           │
 └───────────────────────────────────────────────────────────────────────────┘

 demo/ (same UI + mock adapter + fixtures)  →  Netlify (public, no install)
```

**Data adapter interface:** the UI and core only see an `OrgGraph` (people, work items, pages, pull requests, decisions, each carrying a `RecordRef` with source, id, title, url). Two adapters: `forge` (real) and `mock` (fixtures). This is what lets development proceed without a round trip to Atlassian.

## 5. Platforms ($0)

| Platform | Role | Verdict |
|---|---|---|
| Atlassian Forge | All runtime and hosting | **Core.** Free monthly allowance per app (functions, KVS reads/writes). Rovo usage is billed separately; check the pricing page before submission |
| GitHub + Actions | Repo, CI, `forge deploy` | **Core** |
| Netlify | Public mock-data demo + judge landing page | **Use** (confirm free-tier terms if monetised later) |
| Render | External backend | **Skip.** Nothing needs it; would add egress and cold starts |
| Vercel | Same job as Netlify | **Skip** (Hobby is non-commercial as far as I know) |
| Devpost, YouTube/Loom | Submission, demo video | **Use** |

## 6. Repository layout

```
traceflow/
├─ AGENTS.md, CLAUDE.md         entry point for agents
├─ DESIGN.md                    locked design system and product rules (Hallmark reads it first)
├─ docs/PLAN.md                 this file
├─ docs/PROGRESS.md             living index: what is done, next, verified, blocked
├─ docs/SPIKES.md               the four Forge validation spikes
├─ packages/core/               pure TS: types, risk, lineage, decisions, normalizers, fixtures, tests
├─ demo/                        Vite + React UI on sample data (Netlify)                 ← built (session 1)
├─ app/                         Forge app (manifest, resolvers, Custom UI, Rovo agent)   ← created after `forge create`
├─ .claude/skills/hallmark/     vendored Hallmark design skill (MIT)
├─ .hallmark/log.json           Hallmark's record of design builds (keeps variety honest)
└─ .github/workflows/           ci.yml (verify), forge-deploy.yml (manual, untested)
```

## 7. Data model and risk principles

- Every **Finding** carries: `kind`, `title`, `detail`, `confidence` (high/medium/low), `evidence[]` (RecordRefs), `suggestedActions[]`.
- Direct records (assigned open issue, open PR) → **high** confidence. Inferences (sole contributor on a page) → **medium** and always paired with a caveat.
- Score = transparent weighted sum with weights exposed in config; the UI shows the arithmetic, not just the number.
- A report always includes `caveats[]` explaining what the data cannot prove.

First engine (already in `packages/core`): `assessPersonRisk(graph, personId)` with fixtures and tests.

## 8. Validation spikes (Week 1) — go/no-go gates

| Spike | Question | Exit criterion | If it fails |
|---|---|---|---|
| S1 | Can one Forge app read Jira issues **and** Confluence pages and link them? | A resolver returns an epic with ≥1 linked Confluence page and its child issues on the dev site | Re-scope to whichever product works; this is the non-negotiable gate |
| S2 | Does Teamwork Graph work on the dev site? | `echo` query succeeds, then one contributors query (e.g. page contributors) returns data | Keep adapter stub, drop from MVP, still pursue as stretch |
| S3 | Can a Rovo agent be installed and invoke a Forge action? | Agent answers "risks for person X" via a resolver | Fall back to UI-only; Rovo bonus at risk |
| S4 | Can PRs be read from Bitbucket in a supported way? | A PR (title, author, state) appears in the graph | Bitbucket stays out of scope; mention as roadmap |

## 9. Timeline

| Dates | Milestone |
|---|---|
| Nov 1 – 8 | Repo + CI live, core engine + fixtures, Forge app registered, **spikes S1–S4** |
| Nov 9 – 22 | Person investigation end-to-end (real data), Evidence Drawer, scoring UI |
| Nov 23 – Dec 6 | Project/Decision lineage (graph inside investigation), Teamwork Graph enrichment |
| Dec 7 – 15 | Rovo agent + actions, polish, Atlassian Design Tokens pass, Marketplace listing submission, Netlify demo |
| Dec 16 – 21 | Demo video, README, Devpost text, App ID, buffer. **Submit by Dec 21** |

## 10. CI/CD and secrets

- `ci.yml`: install, typecheck, test, build on every push/PR. No secrets needed.
- `forge-deploy.yml`: **manual** (`workflow_dispatch`), skips itself until `app/manifest.yml` exists. Uses the Forge CLI's `FORGE_EMAIL` and `FORGE_API_TOKEN` environment variables, so no interactive login. *Untested until the Forge app exists.*
- Secrets live only in GitHub → Settings → Secrets → Actions: `FORGE_EMAIL`, `FORGE_API_TOKEN`. **The repo is public: never commit tokens, `.env` files or site URLs that embed credentials.**

## 11. $0 guardrails

- Cache Jira/Confluence reads in KVS with short TTLs; paginate; avoid per-record fan-out calls.
- Keep resolver work small (target graph render < 1.5 s on the demo dataset).
- Check the Forge usage metrics weekly from Week 3.
- No external services, no paid LLM, no database outside Forge.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Teamwork Graph Preview changes or needs admin scopes | D1: core never depends on it; feature flag |
| Cross-product access harder than expected | S1 in Week 1 before any UI polish |
| Cannot verify against Atlassian from my sandbox | CI logs + screenshots from Soham; fixtures cover the logic |
| Teamwork Graph may require the app to be allowlisted by Atlassian support | Ask early if the `echo` query fails (S2); core never depends on it |
| Demo data looks thin | Seed script (run locally) to populate a realistic dev site |
| Overclaiming (SOC 2, "only expert") | Wording rules in §1 |
| Scope creep back to four products | §2 table is the contract; changes need an explicit decision |

## 13. Submission checklist (confirm against the 2026 Devpost rules)

- [ ] Registered on Devpost; solo/team decided
- [ ] Public repo (or shared with the addresses Devpost lists)
- [ ] Forge **App ID** from the Developer Console
- [ ] Category chosen (Apps for Software Teams) + bonus categories declared: Best Agents (Rovo), Best Teamwork Graph integration, Best Marketplace app (listing link or review ticket); `rovo:mcp` only if time allows
- [ ] ~5-minute demo video (storyline: "Your most knowledgeable employee just left. What did they take with them?")
- [ ] README with install steps, wording rules honoured
- [ ] Netlify demo URL (optional but recommended)

## 14. Needed from Soham (heads-up list)

1. Free Atlassian developer site (Cloud Developer License) with Jira + Confluence; Bitbucket workspace if available.
2. Forge CLI installed locally; run `forge register` / `forge create` once (Custom UI template for Jira) and share the **app ID** from `manifest.yml` (not a secret).
3. GitHub repo secrets: `FORGE_EMAIL`, `FORGE_API_TOKEN` (Atlassian API token). Do not paste these in chat.
4. Netlify account; connect this repo from the Netlify UI when `demo/` exists.
5. Devpost registration.

## 15. Sources checked (2026-11-01)

- Forge pricing: https://developer.atlassian.com/platform/forge/forge-platform-pricing/
- Forge CI/CD: https://developer.atlassian.com/platform/forge/set-up-cicd
- Teamwork Graph scopes (Preview, read-only): https://developer.atlassian.com/platform/teamwork-graph/scopes/
- Teamwork Graph curated queries: https://developer.atlassian.com/platform/teamwork-graph/curated-queries/
- Codegeist 2025 winners and bonus categories (for reference): https://www.atlassian.com/blog/developer/meet-the-winners-of-codegeist-2025-atlassian-williams-racing-edition/amp
