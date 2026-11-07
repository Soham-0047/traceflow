# @traceflow/mcp — TraceFlow MCP server

The same TraceFlow engine and `DataAdapter` contract behind the Workbench UI, exposed as
[Model Context Protocol](https://modelcontextprotocol.io) tools for any MCP-capable agent
(Claude Desktop, Claude Code, Cursor, …). Built on the official
[`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk).

## Tools

| Tool | What it answers |
|---|---|
| `traceflow_list_people` | Everyone with a knowledge-risk score, highest first |
| `traceflow_person_risk` | Full risk report for one person: findings, evidence, actions, caveats |
| `traceflow_person_impact` | What breaks without a person: stalled epics, orphaned pages, blocked decisions, unmerged changes |
| `traceflow_epic_lineage` | An epic traced from intent through plan and work to code, with gaps |
| `traceflow_decision_trace` | A decision: linked work, people and roles, findings |
| `traceflow_overview` | Organization aggregates: counts, top risks, epics by gaps |

Every tool result carries the evidence records (source, id, title, url when known) and the
truth rules: findings come from records, and a missing link means "not found in the
connected data", never "does not exist".

## Run

```bash
npm run build -w @traceflow/core   # once: the CLI loads core through the workspace link
node packages/mcp/dist/cli.js      # serves tools over stdio on the sample fixtures
```

Point it at a real `OrgGraph` export (see `@traceflow/core` types) with:

```bash
TRACEFLOW_GRAPH=./graph.json node packages/mcp/dist/cli.js
```

## Register with an MCP client

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "traceflow": {
      "command": "node",
      "args": ["/absolute/path/to/traceflow/packages/mcp/dist/cli.js"],
      "env": { "TRACEFLOW_GRAPH": "/absolute/path/to/graph.json" }
    }
  }
}
```

Inside the Forge app the same tools are exposed through `rovo:mcp` (TF-04); the engine,
the tool descriptions and the evidence rules are identical by construction.

## Develop

```bash
npm test -w @traceflow/mcp        # protocol-level tests over an in-memory transport
npm run typecheck -w @traceflow/mcp
```

The tests run a real `Client` against the server through the SDK's `InMemoryTransport`:
tool listing, schema shape, name-prefix resolution, evidence in every result, and the
helpful-failure contract for unknown people.
