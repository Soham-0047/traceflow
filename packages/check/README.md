# @traceflow/check — the pull-request provenance gate

TraceFlow for the merge button: a pull request passes only when it traces back to
recorded intent. The gate runs on the same `OrgGraph` contract the engine, the
Workbench and the MCP server use, so the verdict is backed by the same evidence
records.

## Verdict rules

| Verdict | When |
|---|---|
| **pass** | The pull request is linked to at least one work item, and none of the linked work implements a **superseded** decision. |
| **fail** | No work item links to the pull request (no recorded provenance from code to intent), or linked work implements a superseded decision (built on a replaced intent). |

A *proposed* (pending) decision does **not** fail the gate: work may legitimately
start while approval is outstanding. Every reason carries the evidence records
(`source:id — title`) so a contributor can check the verdict by hand.

## CLI

```bash
npm run build -w @traceflow/check
node packages/check/dist/cli.js --graph ./graph.json --pr pr-31          # human output
node packages/check/dist/cli.js --graph ./graph.json --pr pr-31 --json   # machine output
```

Exit codes: `0` pass, `1` fail (the verdict), `2` usage or data error.

The `graph.json` is any `OrgGraph` export (see `@traceflow/core` types). When the
Forge app is live, its resolver can produce the same JSON for a connected site.

## GitHub Actions

```yaml
- uses: Soham-0047/traceflow/packages/check@main
  with:
    graph-file: traceflow-graph.json   # produced by an earlier step
    pr-id: ${{ github.event.pull_request.number }}
```

The action is a composite step that runs the bundled CLI; it fails the job on a
`fail` verdict and exports `verdict` as a step output. The bundle is self-contained
(`node dist/cli.js`, core inlined), so no install step is needed.

## Develop

```bash
npm test -w @traceflow/check          # gate rules + CLI arg/exit-code contract
npm run typecheck -w @traceflow/check
```
