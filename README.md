# TraceFlow

**Reveal the hidden dependencies inside your organization — connecting people, decisions, projects and documentation — so knowledge gaps are found before they become business problems.**

Built for Atlassian **Codegeist 2026** on Forge. First product: **Knowledge Risk & Decision Lineage**.

> Status: engine (risk, lineage, overview, impact), five-view Workbench, MCP server, PR provenance gate, Forge app scaffold, seeder and landing page are built and tested (97 tests, Hallmark lint clean on both tiers, axe-core a11y gate). The Forge app waits on a dev site; see [`docs/PROGRESS.md`](docs/PROGRESS.md) for exactly where things stand.

**Try it:** the landing page and the sample-data demo publish to `https://soham-0047.github.io/traceflow/` and `…/traceflow/demo/` — they go live after the one-time Pages source flip (repo Settings → Pages → Source: **GitHub Actions**; see [`docs/PROGRESS.md`](docs/PROGRESS.md), "Blockers needing Soham").

## What it will do

- **Investigate a person**: open work, pages where they are the only recorded contributor, pending decisions, with suggested hand-off actions.
- **See the blast radius**: the Impact view shows every epic, page, decision and pull request that loses its recorded owner if a person becomes unavailable.
- **Investigate a project or decision**: trace an outcome back to its intent and supporting evidence across Jira and Confluence.
- **Evidence Drawer**: every finding shows what was detected, why, which records support it, and how confident it is.
- **Rovo agent**: ask in natural language, e.g. "what are the biggest knowledge-continuity risks in this project?"
- **MCP server**: the same engine as six tools for any AI agent (Claude Desktop, Cursor) — `packages/mcp`.
- **Check gate**: gate a pull request on decision provenance from an OrgGraph export — `packages/check`.

## Products

TraceFlow is one engine with several surfaces and satellites. [`PRODUCTS.md`](PRODUCTS.md) is the full catalog; in short:

| Tier | Products |
| --- | --- |
| T1, ships for Codegeist 2026 | TF-01 Forge app, TF-02 Engine, TF-03 Workbench and public demo, TF-04 Rovo agent, TF-05 Seeder, TF-08 Site and docs |
| T2, reinforces the submission | TF-06 MCP server (built: official SDK, six tools, protocol-tested), TF-07 Check (built: CLI + GitHub Action, tested) |
| T3, roadmap | TF-09 Cloud, TF-10 Connectors, TF-11 Impact (person blast radius shipped, promoted from T3), TF-12 Promises |

## Honest wording

TraceFlow provides *audit-ready evidence* and *decision traceability*. It does not certify compliance. "Sole contributor" means one recorded editor; it cannot prove who is the only person who understands something.

## Repository

| Path | Purpose |
|---|---|
| `AGENTS.md` | Start here if you are an AI agent or a new contributor |
| `PRODUCTS.md` | Every product we are building, tiers, contracts, stack defaults |
| `docs/PROGRESS.md` | What is done, what is next, what is verified, what is blocked |
| `docs/PLAN.md` | Direction, decisions, architecture, timeline, submission checklist |
| `docs/SPIKES.md` | The four Forge validation spikes |
| `DESIGN.md` | Locked design system and product rules ([Hallmark](https://github.com/Nutlope/hallmark) is vendored in `.claude/skills/hallmark`) |
| `packages/core` | Pure TypeScript engine: risk, impact, lineage, overview, decisions, normalizers (tested, no Atlassian dependency) |
| `packages/ui` | The shared investigation UI: overview, people ledger, impact blast radius, epic lineage, decisions, evidence card |
| `demo` | Thin host that serves the UI on sample data (published to GitHub Pages at `/demo/`) |
| `packages/mcp` | MCP server: the engine as six tools for any AI agent (official SDK, stdio) |
| `packages/check` | The pull-request provenance gate: CLI + GitHub Action on an OrgGraph export |
| `app/` | Forge app scaffold: manifest (placeholder app id), `getGraph` resolver with KVS cache, Custom UI hosting the Workbench |
| `tools/seeder/` | Idempotent dev-site seeder for the demo story (dry-run by default) |
| `site/` | The public landing page (published to GitHub Pages at `/`) |
| `.github/workflows` | CI (verify), Pages (site + demo), and a manual Forge deploy workflow |

## Develop

```bash
npm install
npm run verify                 # typecheck, tests, build, design lint (app + page)
npm run dev -w @traceflow/demo # the demo on http://localhost:5173
npm run seed -w @traceflow/seeder  # seed a dev site (dry-run by default; --apply to create)
```

Requires Node 20+. The demo opens on the organization overview and shows sample data from a fictional team; add `?demo=loading`, `?demo=empty` or `?demo=error` to see the other states.
