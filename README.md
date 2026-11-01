# TraceFlow

**Reveal the hidden dependencies inside your organization — connecting people, decisions, projects and documentation — so knowledge gaps are found before they become business problems.**

Built for Atlassian **Codegeist 2026** on Forge. First product: **Knowledge Risk & Decision Lineage**.

> Status: planning and core engine. Nothing here is deployed yet.

## What it will do

- **Investigate a person**: open work, pages where they are the only recorded contributor, pending decisions, with suggested hand-off actions.
- **Investigate a project or decision**: trace an outcome back to its intent and supporting evidence across Jira and Confluence.
- **Evidence Drawer**: every finding shows what was detected, why, which records support it, and how confident it is.
- **Rovo agent**: ask in natural language, e.g. "what are the biggest knowledge-continuity risks in this project?"

## Honest wording

TraceFlow provides *audit-ready evidence* and *decision traceability*. It does not certify compliance. "Sole contributor" means one recorded editor; it cannot prove who is the only person who understands something.

## Repository

| Path | Purpose |
|---|---|
| `docs/PLAN.md` | Direction, decisions, architecture, timeline, submission checklist |
| `packages/core` | Pure TypeScript relationship and risk engine (tested, no Atlassian dependency) |
| `app/` | Forge app (created after `forge register`) |
| `.github/workflows` | CI, plus a manual Forge deploy workflow |

## Develop

```bash
npm install
npm run typecheck
npm test
npm run build
```

Requires Node 20+.
