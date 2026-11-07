# AGENTS.md: start here

TraceFlow is an Atlassian Forge app for the **Codegeist 2026** hackathon (deadline Dec 23, 2026; aim to submit Dec 21). It finds knowledge-continuity risks and traces decisions across Jira and Confluence, with every finding backed by evidence records. Owner: Soham-0047. Budget: **$0**.

## Read in this order
1. `docs/PROGRESS.md`: what is done, what is next, what is verified, open blockers. **Update it before you stop.**
2. `PRODUCTS.md`: every product we are building (TF-01 to TF-12), tiers, shared contracts, stack defaults, and the rules for working in parallel. **Pick your work from here.**
3. `docs/PLAN.md`: direction, scope, decisions, architecture, timeline, submission checklist.
4. `docs/ARCHITECTURE.md`: the core architecture — the validation pipeline, the graph index, the guarantees table, the no-LLM-trust model, the e2e harness.
5. `DESIGN.md`: the locked design system and product rules. `.claude/skills/hallmark/` is the vendored Hallmark skill (MIT).
6. `docs/SPIKES.md`: the four Forge validation spikes that gate real-data work.

## Working in parallel
Several agents may work here at once. Claim a workstream in `docs/PROGRESS.md`, work on `agent/<product>-<topic>`, open a small pull request, keep `main` green, and treat `OrgGraph` and `DataAdapter` as shared contracts. The full rules are at the end of `PRODUCTS.md`. **Tiers:** T1 ships for the hackathon by Dec 21; do T2 only if it helps T1; T3 is briefs only until after.

## Layout
| Path | What |
| --- | --- |
| `packages/core` | Pure TypeScript engine: the validation boundary (`validate.ts`, strict + best-effort), the shared `GraphIndex` + `graphFingerprint`, risk scoring, epic lineage, overview aggregates, decision tracing, change impact, the deterministic answer layer (`query.ts`), the grounding guard (`grounding.ts`), Jira/Confluence normalizers, sample fixtures. Zero runtime dependencies, browser-safe. |
| `packages/ui` | The shared investigation UI (`<Workbench adapter={...} />`) with the Hallmark styles and the UI tests. Consumed from source via an alias. |
| `demo` | Thin Vite host that serves `@traceflow/ui` on sample data (published to GitHub Pages at `/demo/`). |
| `app` | Forge app scaffold (TF-01, TF-04): manifest with a **placeholder app id**, `getGraph` resolver, unit-tested KVS TTL cache, Custom UI hosting the Workbench. Needs `forge register` by Soham (see `app/README.md`). |
| `tools/seeder` | TF-05: idempotent dev-site seeder. Pure planner (unit-tested) + UNVERIFIED REST client; dry-run by default. |
| `site` | TF-08: the public landing page (static HTML + CSS, Hallmark page flow, published to Pages at `/`). |
| `.github/workflows` | `ci.yml` (verify on every push), `pages.yml` (site + demo to GitHub Pages), `forge-deploy.yml` (manual; refuses the placeholder app id). |

## Commands (Node 20+)
```
npm install
npm run verify          # typecheck + tests + build + e2e harness + Hallmark design lint + a11y
npm run e2e             # the 10-stage end-to-end harness alone (after `npm run build`)
npm run progress:write  # refresh the table in docs/PROGRESS.md after ticking boxes
```

## Rules
- **Evidence first — and enforced, not just promised.** Findings derive from records, never from an LLM. Every `Finding` carries `evidence[]`, a `confidence`, and the report carries `caveats[]`. Untrusted input crosses `runPipeline` (strict for exports and gates; best-effort for live sources). Answers come from the deterministic answer layer (`answerQuery`); an LLM may only rephrase an `AnswerResult` through `groundedAnswer`, which verifies the phrasing against the answer's facts and falls back to the engine's own words on any violation. See `docs/ARCHITECTURE.md`.
- **Honest wording.** "Audit-ready evidence", "decision traceability", "sole contributor". Never "SOC 2 proof" or "sole knowledge holder". Never promise unlimited $0.
- **Coverage-aware.** Do not flag what the connected data cannot show (example: no pull-request data means no "done without implementation" finding).
- **Secrets.** The repo is public. Never commit tokens, `.env` files or credentials. Forge credentials live only in GitHub Actions secrets (`FORGE_EMAIL`, `FORGE_API_TOKEN`).
- **Commits** are authored as `Soham-0047 <87080389+Soham-0047@users.noreply.github.com>`.
- **No invented data.** Figures in the UI come from the labelled sample fixture only.
- **Unverified is labelled.** Anything not run against a real Atlassian site (Forge, REST payload shapes, Teamwork Graph, Rovo) is marked unverified in code comments and in `docs/PROGRESS.md`.
- **Tests travel with code.** New engine behaviour needs a test in `packages/core/test`; new UI behaviour needs one in `demo/src/test`.
- **Design.** Follow `DESIGN.md` and Hallmark. `npm run lint:design` must stay at 0 FAIL, 0 WARN.

## Definition of done for a change
`npm run verify` passes, `docs/PROGRESS.md` boxes and session log are updated (`npm run progress:write`), and anything newly verified or newly assumed is recorded there.

## Limits to know
- The agent sandbox that built sessions 1 and 2 could reach GitHub and npm but **not** Atlassian: no `forge deploy`, no calls to a Jira site. Real-site verification goes through GitHub Actions logs and screenshots from Soham. (Session 3 ran a headless browser locally, so visual review and the Hallmark render tier are done; a screen-reader pass is still owed.)
- Anything not run against a real Atlassian site (Forge runtime, REST payload shapes, Teamwork Graph, Rovo, the seeder's REST calls) is marked UNVERIFIED in code comments and in `docs/PROGRESS.md`.
