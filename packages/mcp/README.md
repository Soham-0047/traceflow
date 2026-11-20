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
| `traceflow_epic_impact` | What breaks if an epic changes: orphaned open work, stale specs, unreviewed changes, who needs to know |
| `traceflow_decision_trace` | A decision: linked work, people and roles, findings |
| `traceflow_decision_impact` | What breaks if a decision changes: outdated work, outdated changes, who needs to know |
| `traceflow_overview` | Organization aggregates: counts, top risks, epics by gaps |
| `traceflow_query` | Any natural-language question, answered deterministically with evidence and caveats |

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

Or serve a live Atlassian Cloud site directly (read with the token owner's permissions,
refreshed every five minutes):

```bash
export ATLASSIAN_SITE_URL=https://your-site.atlassian.net
export ATLASSIAN_EMAIL=you@example.com
export ATLASSIAN_API_TOKEN=...   # https://id.atlassian.com/manage-profile/security/api-tokens
node packages/mcp/dist/cli.js
```

## Export a live site: `traceflow-export`

The same three variables let `traceflow-export` write an `OrgGraph` export, which is what
`TRACEFLOW_GRAPH` and the check gate (`traceflow-check --graph`) read. The export passes
the strict validation pipeline before it is written.

```bash
node packages/mcp/dist/export-cli.js --out graph.json
node packages/mcp/dist/export-cli.js --out graph.json --raw traceflow-raw   # spike S1
node packages/mcp/dist/export-cli.js --jql "project = PAY AND updated >= -90d" --max-issues 200
```

`--raw DIR` writes every raw REST response next to its path, so spike S1 can diff the real
payloads against the shapes the loader was written from. Raw responses contain your site's
data (`traceflow-raw/` is git-ignored): never commit them. The reads use Jira's enhanced
search (`/rest/api/3/search/jql`), the Confluence v2 API and Jira's user bulk lookup; the
shared loader is `packages/core/src/site-loader.ts`.

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

Inside the Forge app the same nine tools are Rovo actions, and the `rovo:mcp` module exposes
them on Atlassian's MCP infrastructure (`app/manifest.yml`). Both hosts register from one
catalog (`packages/core/src/tools.ts`), so names, descriptions, inputs and results are
identical by construction.

## Develop

```bash
npm test -w @traceflow/mcp        # protocol-level tests over an in-memory transport
npm run typecheck -w @traceflow/mcp
```

The tests run a real `Client` against the server through the SDK's `InMemoryTransport`:
tool listing, schema shape, name-prefix resolution, evidence in every result, and the
helpful-failure contract for unknown people.
