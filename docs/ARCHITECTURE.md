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

Understanding a question used to be exact-match regexes; it is now three small
algorithm modules in `packages/core` plus one wrapped open-source tagger, and their quality is a
**measured, CI-gated number**, not a vibe:

| Module | What it does | Key ideas |
| --- | --- | --- |
| `text.ts` | string primitives | Damerau-Levenshtein (optimal string alignment) with an early-exit bound; length-aware typo budgets (3-char words get no budget — "sam" vs "sat" are different words); token-set similarity that survives reordering; **inflectional token equality** (`inflectionalMatch`) folding only the three English plural rules (-s, -es, consonant+y→-ies, both directions) so "retry" matches "retries" — three edits apart, beyond every typo budget — while derivationally related words ("decide"/"decision") deliberately stay different words | 
| `matcher.ts` | WHICH entity (person, epic, decision) | fixed-score lanes (exact id 1.00 → full name 0.95 → all tokens typo-tolerant 0.90 → bare id word 0.80 → distinctive token 0.75); candidates ranked by (score desc, id asc) for determinism; ties within 0.10 are **ambiguous, never guessed**; a single distinctive title token only anchors a question when a domain word is present ("trace the auth epic" matches, "the payments service" does not), and the decision domain can also be carried by **phrases** — decide-verbs, "made the call", "move away from" — so "what did we decide on retries?" resolves without the noun "decision"; the token structures (name-token holders, title tokens, distinctive sets) are computed once per graph in a shared matcher index, like the engine's `GraphIndex` |
| `intent.ts` | WHAT is asked | weighted word signals per intent (strong 3 / medium 2 / weak 1); entity-first arbitration — the matched entity decides the subject, the scores decide the shape; past participles ("is superseded") are states, not change hypotheses, so "when was X superseded" traces instead of exploding into impact; the risk lexicon covers the synonym families people actually use (single point of failure, irreplaceable, institutional knowledge, most critical person, succession plan, bus factor, highest-impact, weakest link, liability, carrying-the-most-context), and impact wording includes consequences-of, bottleneck, damage, availability clauses ("if sam is out sick/on leave") and "lost" |
| `query.ts` | arbitration + honesty guards | the answer layer that combines matcher + intents into the eight intents; a **command guard** refuses scheduling/messaging requests before entity matching ("book a meeting with priya" must not produce her risk profile); a **plural-epic guard** refuses "which epics are most at risk?" instead of guessing the people ranking; **did-you-mean** suggestions are ranked per miss by intent affinity, named entities and token similarity, deterministically; the person risk reports ride a per-graph, weights-keyed memo so a warm "top risks" or overview is a map lookup (measured: 7k-record org, ~1.6 ms per warm question, 3–5× cache effect) |
| `query.ts` | arbitration + honesty guards | the answer layer that combines matcher + intents into the eight intents; a **command guard** refuses scheduling/messaging requests before entity matching ("book a meeting with priya" must not produce her risk profile); a **plural-epic guard** refuses "which epics are most at risk?" instead of guessing the people ranking; **did-you-mean** suggestions are ranked per miss by intent affinity, named entities and token similarity, deterministically; the person risk reports ride a per-graph, weights-keyed memo so a warm "top risks" or overview is a map lookup (measured: 7k-record org, ~1.6 ms per warm question, 3–5× cache effect) |
| `nlp.ts` | POS gates + idiom lexicon (session 14) | the engine's first runtime dependency — `compromise` (MIT, ~250 KB, zero transitive runtime deps, offline, no models) wrapped behind every engine contract: only the stable surfaces are exposed (POS tags, `.has()` idiom membership, person words — compromise's internal term ids are per-instance counters and never escape, so the determinism stage stays green); one analysis per question cached in a bounded LRU of 512 (~0.2 ms per cold call, e2e latency budgets intact); the domain lexicon is taught once (the availability NOUNS leave/sabbatical/vacation so the tagger can disambiguate noun from verb — the thing enumeration never could — plus the multiword idioms bus-number/knock-on-effect and the mistagged verb senses ghosts/shelved/travelling); used ONLY as gates: the regexes keep the semantics, the tags decide when a lazy lane may trust a word's grammatical role (the departure lane may not fire when the taught noun "leave" is present, tagged a noun, and no departure verb form exists) |

**The efficiency metric.** `eval.ts` carries a 485-case labeled corpus — realistic
phrasings per intent (typos, reordered titles, partial names, indirect language),
unanswerable-but-plausible questions that must be refused honestly (including
scheduling/messaging commands, which a person-naming engine would otherwise
"answer" with a risk profile), and eleven documented frontier gaps labeled with
ideal behavior the engine does not reach yet (the ranking-synonym family —
linchpin, key persons, indispensable, guardians of tribal knowledge, spread
thin, never-want-to-lose, fallout — and the scoping/priority family — a
decision blocking an epic's work, deprioritize as a change-verb, a scoped
"payments single point of failure" ranking).
`evaluateAnswerLayer()` runs every case end to end (question in → full
`AnswerResult` out → intent AND target entity verified) and computes

```
efficiency = cases handled correctly / total cases
```

Measured: **94.4% (458/485)** — inside the tuned 88–95% band. The honest-miss
group is 98/98: the engine never invents an answer to a question it cannot map.
The number is gated twice: `eval.test.ts` fails below 88%, and e2e stage 11
prints the summary and enforces the same floor. Closing a documented gap raises
the number; the floor catches regressions when matcher or intent changes break
real phrasings. Sessions 10–13 each closed the previous frontier and grew the
corpus with probed cases; session 14 closed all twenty-six session-13 gaps in
one pass — the compromise POS gates plus the idiom lexicon — and documented the
next twenty-seven, capability up, number honestly in band.

The same matchers back the tool surfaces: the MCP resolvers (and any future
connector) resolve `person: "Alexs Rivera"`, `epic: "pay-1"` or
`decision: "the idempotency decision"` through the shared `resolve*` API in
`matcher.ts` — with `assumeDomain`, because a tool argument is a deliberate
reference, not prose.

## The end-to-end harness

`npm run e2e` (`scripts/e2e.mjs`, in CI after build) walks every pipeline stage with real boundaries:

1. fixtures through the strict pipeline; 2. a corrupt export quarantined (best-effort) and refused (strict) with issue paths; 3. shuffled input → byte-identical fingerprint, analysis and answers; 4. the sample story's known facts, now including epic and decision impact; 5. eight answer intents + four honest misses (nonsense, an impact question naming no entity, a scheduling command, an epic-ranking question); 6. grounding accept/reject/fallback over both a person-risk and an epic-impact answer; 7. nine MCP tools over `InMemoryTransport`; 8. the **built MCP CLI as a subprocess** answering a real JSON-RPC handshake and two `tools/call`s over stdio; 9. the **bundled check CLI as a subprocess** returning exit codes 0/1/2 on pass/fail/data-error cases; 10. a synthetic 7,150-record org inside CI-safe performance budgets; 11. the **labeled NLU corpus**: 208 questions answered end to end, efficiency measured (94.7%) and gated at the 88% floor, honest refusals 38/38; 12. **per-question latency budgets** on the same 7k org — a ten-question battery cold and warm, with the warm pass required to beat cold (the caches must engage) and byte-identical repeat answers (measured locally: ~56 ms cold, ~25 ms warm per ten-question battery, cache effect engaged).

## Package map

| Package | Role |
| --- | --- |
| `packages/core` | Everything above the trust boundary and below the surfaces. Pure TypeScript, zero runtime dependencies, browser-safe (no Node APIs) — the demo imports it from source. |
| `packages/ui` | The Workbench (five views) on the same reports. |
| `demo` | Thin host on sample fixtures. |
| `packages/mcp` | Nine `traceflow_*` tools over any validated `GraphSource`; stdio CLI with export parsing. |
| `packages/check` | The PR provenance gate; CLI parses exports through the same strict pipeline. |
| `app` | Forge scaffold; the resolver and the Rovo agent action sanitize the site-built graph through best-effort before caching, and answer through the same answer layer. |
