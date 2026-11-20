# Devpost submission draft (Codegeist 2026)

Draft for Soham to paste into Devpost and adjust after the first real deploy. Every claim
below must still be true on the day you submit; lines marked **[after deploy]** describe
things only a deployed app can prove. Deadline: **Dec 22, 2026, 12:00 PM PT** (submit by
Dec 21). Re-check the Devpost rules page for required fields on the day.

- **Track:** Software teams
- **Bonus awards to declare:** Best Rovo Agent; Best MCP App. Add Best Marketplace Published
  App only with a listing link or review ticket, and Best Teamwork Graph Integration only if
  spike S2 lands.
- **App ID:** from `app/manifest.yml` after `forge register` **[after deploy]**
- **Code:** https://github.com/Soham-0047/traceflow (public)
- **Demo:** https://soham-0047.github.io/traceflow/demo/ (sample data), once the Pages
  source flip is done
- **Video:** under 5 minutes, public, following `docs/demo-script.md` **[after deploy]**

## Tagline

Find what your organization depends on before it walks out the door: knowledge risk and
decision lineage from your own Jira and Confluence records, with the evidence behind every
finding.

## Inspiration

When a senior engineer leaves, everyone knows their open tickets. Nobody knows which runbooks
only they ever edited, which decisions are still waiting on them, or which epic quietly loses
its only recorded owner. That knowledge is already in Jira and Confluence. It just isn't
connected.

## What it does

- **People:** ranks knowledge-continuity risk per person with a handover ledger (records ×
  weight = points), so every number can be checked against the records behind it.
- **Impact:** the blast radius if a person becomes unavailable, or if an epic or a decision
  changes: the work, pages, decisions and pull requests that lose their recorded owner or
  plan, and who needs to know.
- **Lineage:** traces an epic from recorded intent to plan, work and code, and names the gaps,
  such as finished work under a decision that is still only proposed.
- **Ask:** natural-language questions answered by a deterministic engine. It says "I cannot
  answer that" instead of guessing, and every answer carries its evidence and caveats.
- **Rovo agent (TraceFlow Risk Analyst):** the same engine in Rovo chat. The action returns
  the engine's own answer, and the prompt forbids adding any person, id or number that is not
  in it.
- **MCP:** the same nine tools for any agent, through the app's `rovo:mcp` module on
  Atlassian's MCP infrastructure and through a standalone MCP server.

## How we built it

- **Forge, end to end:** a Jira global page (Custom UI), nine read-only Rovo actions, a Rovo
  agent and a `rovo:mcp` module, with KVS caching. No external permissions: fonts are bundled
  and nothing leaves Atlassian.
- **Reads as the user:** every Jira and Confluence call runs with the viewer's permissions,
  and the cache is per account, so nobody sees a record they could not open themselves.
- **One engine, every surface:** a pure TypeScript engine (risk, impact, lineage, answers)
  behind a validated pipeline. The Workbench, the agent, both MCP hosts and a pull-request
  gate all read the same reports.
- **One tool catalog:** the manifest's actions and MCP tools are generated from the same
  catalog that the MCP server registers from, then checked in CI with Atlassian's own
  manifest validator.
- **Current APIs:** Jira's enhanced JQL search and the Confluence v2 API, with paging guards
  and coverage rules. For example, a page is only reported as having a sole contributor when
  its edit history was actually read.
- **Measured understanding:** the answer layer is scored on a 556-question labeled corpus at
  93.9%, gated in CI at 88%. It refuses all 112 unanswerable questions honestly.

## Challenges

- Making AI safe to trust with facts: no model is in the loop for facts. The engine answers,
  and a model may only rephrase that answer.
- Honest coverage: activity data cannot prove who *understands* something, so the product
  says "sole contributor" (one recorded editor) and never "sole knowledge holder".

## Accomplishments

- Every finding opens an evidence card: what was found, why it was flagged, the supporting
  records, the confidence, and what to do.
- A 13-stage end-to-end harness in CI, from a recorded Atlassian site through the loader, an
  export and the MCP server over stdio.

## What's next

Teamwork Graph enrichment, Bitbucket pull requests for code lineage, and risk over time.

## Honest wording (keep)

"Audit-ready evidence", "decision traceability", "sole contributor". Never "SOC 2 proof",
"compliance certified" or "sole knowledge holder", and never a promise of unlimited free use.
