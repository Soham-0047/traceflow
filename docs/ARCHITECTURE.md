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
   (person         (epic traces,     (person, epic   (org counts,  (deterministic
   scores)          decisions)        and decision    epic gaps)    answers)
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

1. `answerQuery(graph, question)` maps a question to one of eight intents (`overview`, `top-risks`, `person-risk`, `person-impact`, `epic-lineage`, `epic-impact`, `decision-trace`, `decision-impact`) with the in-house NLU (below). No model is involved; an unmappable question returns `understood: false` plus the questions the engine *can* answer — it never guesses.
2. The `AnswerResult` carries `data` (the structured report) and `evidence` (records). This is the only material an AI surface may phrase.
3. `groundedAnswer(llmText, answer)` checks the phrasing: every person name, record id and number must exist in the answer's facts. On any violation the caller serves `answer.answer` — the engine's own words, correct by construction. The guard is lexical (it catches invented people, ids and numbers, the common hallucination shapes), and its limits are stated in `grounding.ts`.
4. The Rovo agent (TF-04, `app/src/backend/agent.ts`) is the one surface whose model layer we cannot intercept: Rovo's model phrases the payload after our function returns. So the action returns the full `AnswerResult` — the deterministic answer is always inside the payload — and the agent's prompt (the part of the model we do control) carries the truth rules: relay the `answer` field, never add people, record ids, titles or numbers, keep the caveats, offer the evidence records, admit an honest miss. Model-extracted inputs are treated as untrusted: validated, capped, never used for authorization; the action is read-only (`actionVerb: GET`).

## The in-house NLU and its measured efficiency

Understanding a question used to be exact-match regexes; it is now three small,
dependency-free algorithm modules in `packages/core`, and their quality is a
**measured, CI-gated number**, not a vibe:

| Module | What it does | Key ideas |
| --- | --- | --- |
| `text.ts` | string primitives | Damerau-Levenshtein (optimal string alignment) with an early-exit bound; length-aware typo budgets (3-char words get no budget — "sam" vs "sat" are different words); token-set similarity that survives reordering | 
| `matcher.ts` | WHICH entity (person, epic, decision) | fixed-score lanes (exact id 1.00 → full name 0.95 → all tokens typo-tolerant 0.90 → bare id word 0.80 → distinctive token 0.75); candidates ranked by (score desc, id asc) for determinism; ties within 0.10 are **ambiguous, never guessed**; a single distinctive title token only anchors a question when a domain word is present ("trace the auth epic" matches, "the payments service" does not) |
| `intent.ts` | WHAT is asked | weighted word signals per intent (strong 3 / medium 2 / weak 1); entity-first arbitration — the matched entity decides the subject, the scores decide the shape; past participles ("is superseded") are states, not change hypotheses, so "when was X superseded" traces instead of exploding into impact |

**The efficiency metric.** `eval.ts` carries a 146-case labeled corpus — realistic
phrasings per intent (typos, reordered titles, partial names, indirect language),
unanswerable-but-plausible questions that must be refused honestly, and nine
documented synonym gaps ("most critical person", "single point of failure",
"irreplaceable"…) labeled with ideal behavior the engine does not reach yet.
`evaluateAnswerLayer()` runs every case end to end (question in → full
`AnswerResult` out → intent AND target entity verified) and computes

```
efficiency = cases handled correctly / total cases
```

Measured: **93.8% (137/146)** — inside the tuned 88–95% band. The honest-miss
group is 22/22: the engine never invents an answer to a question it cannot map.
The number is gated twice: `eval.test.ts` fails below 88%, and e2e stage 11
prints the summary and enforces the same floor. Closing a documented gap raises
the number; the floor catches regressions when matcher or intent changes break
real phrasings.

The same matchers back the tool surfaces: the MCP resolvers (and any future
connector) resolve `person: "Alexs Rivera"`, `epic: "pay-1"` or
`decision: "the idempotency decision"` through the shared `resolve*` API in
`matcher.ts` — with `assumeDomain`, because a tool argument is a deliberate
reference, not prose.

## The end-to-end harness

`npm run e2e` (`scripts/e2e.mjs`, in CI after build) walks every pipeline stage with real boundaries:

1. fixtures through the strict pipeline; 2. a corrupt export quarantined (best-effort) and refused (strict) with issue paths; 3. shuffled input → byte-identical fingerprint, analysis and answers; 4. the sample story's known facts, now including epic and decision impact; 5. eight answer intents + two honest misses (nonsense, and an impact question naming no entity); 6. grounding accept/reject/fallback over both a person-risk and an epic-impact answer; 7. nine MCP tools over `InMemoryTransport`; 8. the **built MCP CLI as a subprocess** answering a real JSON-RPC handshake and two `tools/call`s over stdio; 9. the **bundled check CLI as a subprocess** returning exit codes 0/1/2 on pass/fail/data-error cases; 10. a synthetic 7,150-record org inside CI-safe performance budgets; 11. the **labeled NLU corpus**: 146 questions answered end to end, efficiency measured (93.8%) and gated at the 88% floor, honest refusals 22/22.

## Package map

| Package | Role |
| --- | --- |
| `packages/core` | Everything above the trust boundary and below the surfaces. Pure TypeScript, zero runtime dependencies, browser-safe (no Node APIs) — the demo imports it from source. |
| `packages/ui` | The Workbench (five views) on the same reports. |
| `demo` | Thin host on sample fixtures. |
| `packages/mcp` | Nine `traceflow_*` tools over any validated `GraphSource`; stdio CLI with export parsing. |
| `packages/check` | The PR provenance gate; CLI parses exports through the same strict pipeline. |
| `app` | Forge scaffold; the resolver and the Rovo agent action sanitize the site-built graph through best-effort before caching, and answer through the same answer layer. |
