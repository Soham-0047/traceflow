# TraceFlow core architecture

How the engine is built, and where each quality — fast, reliable, secure, never-LLM-trusted — is enforced. Written for contributors and Codegeist judges; `docs/PLAN.md` keeps the product direction, this file describes the machine.

## The one diagram

```
                                   TRUST BOUNDARY (validate.ts)
  ┌───────────────┐   ┌──────────────┐   ┌───────────────────────────────┐
  │ sample data   │   │ OrgGraph     │   │ Forge resolver (Jira/Confluence│
  │ (fixtures)    │   │ export (file │   │ REST, normalizers)            │
  └───────┬───────┘   │ or env var)  │   └──────────────┬────────────────┘
          │           └───────┬──────┘                  │
          │                   │                         │
          └───────────────────┴─────────────┬───────────┘
                                            ▼
                        ┌────────────────────────────────────┐
                        │  runPipeline (pipeline.ts)         │
                        │  strict: refuse, list every issue  │
                        │  best-effort: quarantine + warn    │
                        │  caps on bytes, records, strings   │
                        └────────────────┬───────────────────┘
                                         ▼  OrgGraph (typed, bounded)
                        ┌────────────────────────────────────┐
                        │  GraphIndex (graph-index.ts)       │
                        │  memoized per graph (WeakMap)      │
                        │  + graphFingerprint (order-blind)  │
                        └────────────────┬───────────────────┘
                                         ▼
        ┌───────────────┬────────────────┼────────────────┬──────────────┐
        ▼               ▼                ▼                ▼              ▼
   risk.ts         lineage.ts        impact.ts       overview.ts    query.ts
   (person         (epic traces,     (blast          (org counts,  (deterministic
   scores)          decisions)        radius)          epic gaps)    answers)
        └───────────────┴────────────────┴────────────────┴──────┬───────┘
                                                                 ▼
                                            ┌─────────────────────────────────┐
                                            │ answerQuery: AnswerResult       │
                                            │ { answer, data, evidence,       │
                                            │   caveats, understood }         │
                                            └───────┬───────────────┬─────────┘
                                                    │               │
                                    LLM rephrasing  │               │  direct
                                    (Rovo / agent)  ▼               ▼
                                    ┌──────────────────────┐   ┌──────────────┐
                                    │ groundedAnswer       │   │ Workbench UI │
                                    │ (grounding.ts):      │   │ MCP tools    │
                                    │ lexical check against│   │ check gate   │
                                    │ the answer's facts;  │   └──────────────┘
                                    │ fallback = the       │
                                    │ deterministic answer │
                                    └──────────────────────┘
```

## Where each guarantee lives

| Guarantee | Enforced by | Test |
| --- | --- | --- |
| **Bounded input** — no hostile source can make the engine allocate or loop without limit | `LIMITS` in `validate.ts`: 50 MB JSON cap, per-collection caps (10k people, 50k work items…), 100k total records, string and link-list caps | `validate.test.ts` |
| **Precise failures** — a broken record is named, not stack-traced | every issue carries a path (`$.workItems[11].status`); `ValidationError` lists them all (capped at 20 in the message) | `validate.test.ts`, e2e stage 2, check CLI exit 2 |
| **Fault isolation** — one bad record never kills a surface | `sanitizeGraph` quarantines records, drops dangling cross-refs, reports everything removed; `validatedSource` in the MCP server; `runPipeline(mode: 'best-effort')` in the Forge resolver | `validate.test.ts`, MCP tests, e2e stage 2 |
| **No prototype pollution** | `__proto__` / `constructor` / `prototype` keys rejected at the boundary; sanitize rebuilds records with own properties only | `validate.test.ts` |
| **Deterministic** — same records in any order, byte-identical output | canonical ordering everywhere (evidence sorted by id, people by id, epics by id); `analyzeAll` and every answer are byte-identical under shuffled input | e2e stage 3, `pipeline.test.ts` |
| **Fast** — one index, no re-scans | `GraphIndex` (maps for people/work/pages/PRs/decisions + reverse link maps), memoized per graph via WeakMap, shared by every engine function and surface; 7,150-record org analyzes cold in ~120 ms | `graph-index.test.ts`, e2e stage 10 |
| **Cache-friendly** | `graphFingerprint`: order-blind, presentation-blind (urls ignored) change-detection key over the data; the app cache and future sync jobs can skip unchanged work | `graph-index.test.ts` |
| **Evidence-first** — findings come from records, never a model | every finding carries `evidence[]` + `confidence` + `caveats[]`; the answer layer renders from engine data only | all engine tests, e2e stages 4–5 |
| **No LLM trust** — AI may explain, never originate | `answerQuery` never calls a model; an LLM may only rephrase an `AnswerResult`, and `checkGrounding` lexically verifies people, record ids and numbers against the answer's facts — any violation falls back to the deterministic text | `grounding.test.ts`, e2e stage 6 |
| **Honest coverage** — never flag what the data cannot show | coverage flags on every report (`coverage.confluence`, `coverage.code`); caveats rendered next to every score | lineage/overview tests |

## The two pipeline modes

- **`strict`** — refuse the whole input when anything structural is wrong. Used by exports and the check gate (`runPipelineOnJson`), where silently losing a record would change a verdict or hide a risk.
- **`best-effort`** — quarantine broken records, drop dangling references, keep the surface alive, report everything removed. Used by live sources (MCP `validatedSource`, the Forge resolver). Whole-shape failures (not an object, caps blown) still throw: per-record damage is survivable, whole-graph damage is not.

## The no-LLM-trust model (TF-04 groundwork)

1. `answerQuery(graph, question)` maps a question to one of six intents (`overview`, `top-risks`, `person-risk`, `person-impact`, `epic-lineage`, `decision-trace`) with deterministic keyword/entity rules. No model is involved; an unmappable question returns `understood: false` plus the questions the engine *can* answer — it never guesses.
2. The `AnswerResult` carries `data` (the structured report) and `evidence` (records). This is the only material an AI surface may phrase.
3. `groundedAnswer(llmText, answer)` checks the phrasing: every person name, record id and number must exist in the answer's facts. On any violation the caller serves `answer.answer` — the engine's own words, correct by construction. The guard is lexical (it catches invented people, ids and numbers, the common hallucination shapes), and its limits are stated in `grounding.ts`.

## The end-to-end harness

`npm run e2e` (`scripts/e2e.mjs`, in CI after build) walks every pipeline stage with real boundaries:

1. fixtures through the strict pipeline; 2. a corrupt export quarantined (best-effort) and refused (strict) with issue paths; 3. shuffled input → byte-identical fingerprint, analysis and answers; 4. the sample story's known facts; 5. six answer intents + honest miss; 6. grounding accept/reject/fallback; 7. seven MCP tools over `InMemoryTransport`; 8. the **built MCP CLI as a subprocess** answering a real JSON-RPC handshake and `tools/call` over stdio; 9. the **bundled check CLI as a subprocess** returning exit codes 0/1/2 on pass/fail/data-error cases; 10. a synthetic 7,150-record org inside CI-safe performance budgets.

## Package map

| Package | Role |
| --- | --- |
| `packages/core` | Everything above the trust boundary and below the surfaces. Pure TypeScript, zero runtime dependencies, browser-safe (no Node APIs) — the demo imports it from source. |
| `packages/ui` | The Workbench (five views) on the same reports. |
| `demo` | Thin host on sample fixtures. |
| `packages/mcp` | Seven `traceflow_*` tools over any validated `GraphSource`; stdio CLI with export parsing. |
| `packages/check` | The PR provenance gate; CLI parses exports through the same strict pipeline. |
| `app` | Forge scaffold; the resolver sanitizes the site-built graph through best-effort before caching. |
