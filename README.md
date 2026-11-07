# TraceFlow

**Reveal the hidden dependencies inside your organization — connecting people, decisions, projects and documentation — so knowledge gaps are found before they become business problems.**

Built for Atlassian **Codegeist 2026** on Forge. First product: **Knowledge Risk & Decision Lineage**.

> Status: core engine and a sample-data demo are built and tested. The Forge app is the next step. See [`docs/PROGRESS.md`](docs/PROGRESS.md) for exactly where things stand.

## What it will do

- **Investigate a person**: open work, pages where they are the only recorded contributor, pending decisions, with suggested hand-off actions.
- **Investigate a project or decision**: trace an outcome back to its intent and supporting evidence across Jira and Confluence.
- **Evidence Drawer**: every finding shows what was detected, why, which records support it, and how confident it is.
- **Rovo agent**: ask in natural language, e.g. "what are the biggest knowledge-continuity risks in this project?"

## Products

TraceFlow is one engine with several surfaces and satellites. [`PRODUCTS.md`](PRODUCTS.md) is the full catalog; in short:

| Tier | Products |
| --- | --- |
| T1, ships for Codegeist 2026 | TF-01 Forge app, TF-02 Engine, TF-03 Workbench and public demo, TF-04 Rovo agent, TF-05 Seeder, TF-08 Site and docs |
| T2, only if it helps T1 | TF-06 MCP server, TF-07 Check (pull-request provenance gate) |
| T3, roadmap | TF-09 Cloud, TF-10 Connectors, TF-11 Impact, TF-12 Promises |

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
| `packages/core` | Pure TypeScript engine: risk, lineage, decisions, normalizers (tested, no Atlassian dependency) |
| `packages/ui` | The shared investigation UI: people ledger, epic lineage, decisions, evidence card |
| `demo` | Thin host that serves the UI on sample data |
| `app/` | Forge app (created after `forge create`) |
| `.github/workflows` | CI, plus a manual Forge deploy workflow |

## Develop

```bash
npm install
npm run verify                 # typecheck, tests, build, design lint
npm run dev -w @traceflow/demo # the demo on http://localhost:5173
```

Requires Node 20+. The demo shows sample data from a fictional team; add `?demo=loading`, `?demo=empty` or `?demo=error` to see the other states.
