# AGENTS.md: start here

TraceFlow is an Atlassian Forge app for the **Codegeist 2026** hackathon (deadline Dec 23, 2026; aim to submit Dec 21). It finds knowledge-continuity risks and traces decisions across Jira and Confluence, with every finding backed by evidence records. Owner: Soham-0047. Budget: **$0**.

## Read in this order
1. `docs/PROGRESS.md`: what is done, what is next, what is verified, open blockers. **Update it before you stop.**
2. `docs/PLAN.md`: direction, scope, decisions, architecture, timeline, submission checklist.
3. `DESIGN.md`: the locked design system and product rules. `.claude/skills/hallmark/` is the vendored Hallmark skill (MIT).
4. `docs/SPIKES.md`: the four Forge validation spikes that gate real-data work.

## Layout
| Path | What |
| --- | --- |
| `packages/core` | Pure TypeScript engine: `OrgGraph` types, risk scoring, epic lineage, decision tracing, Jira/Confluence normalizers, sample fixtures. No Atlassian dependency. |
| `demo` | Vite + React UI on sample data (deployed to Netlify). Imports core from source via an alias. |
| `app` | Forge app. Not created yet; needs `forge register` by Soham (see `app/README.md`). |
| `.github/workflows` | `ci.yml` (verify on every push), `forge-deploy.yml` (manual, untested). |

## Commands (Node 20+)
```
npm install
npm run verify          # typecheck + tests + build + Hallmark design lint
npm run progress:write  # refresh the table in docs/PROGRESS.md after ticking boxes
```

## Rules
- **Evidence first.** Findings derive from records, never from an LLM. Every `Finding` carries `evidence[]`, a `confidence`, and the report carries `caveats[]`. AI may explain and suggest; it is never the source of truth.
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
- The agent sandbox that built this could reach GitHub and npm but **not** Atlassian: no `forge deploy`, no calls to a Jira site. Real-site verification goes through GitHub Actions logs and screenshots from Soham.
- No headless browser was available, so the visual render of the demo and Hallmark's render tier have not been run.
