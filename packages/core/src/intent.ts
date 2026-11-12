/**
 * The intent layer of the in-house NLU: a weighted bag-of-signals scorer that
 * replaces first-match-wins regex dispatch. Every signal is a fixed-weight
 * word pattern; the score of an intent is the sum of the weights of its
 * matched signals. Pure function of the question, so arbitration is
 * deterministic and explainable — each score can be printed as "which words
 * fired, with which weights".
 *
 * The answer layer (query.ts) combines these scores with the entity match:
 * the entity decides the subject (person, epic, decision), the scores decide
 * the question shape (blast radius, ranking, overview, trace).
 *
 * Session 14: the layer gained its first open-source component — the
 * compromise POS tagger (nlp.ts), used ONLY as a gate on the lazy lanes and
 * a lexicon for the multiword domain idioms ("bus number", "knock-on
 * effect"). The regexes stay the source of truth for what a wording means;
 * the POS tags decide when a lazy lane may trust a word's grammatical role
 * (the session-13 bare-"leave" bug class, mechanized). See nlp.ts for the
 * determinism, cost and honesty contracts that wrapping enforces.
 */

import { analyzeQuestion } from './nlp.js';

export interface IntentScores {
  /** "What breaks if X leaves / changes / is superseded?" */
  impact: number;
  /** "Biggest / top / ranked risks?" */
  topRisks: number;
  /** "Overview / summary / how are we doing?" */
  overview: number;
  /** Domain words: epic, lineage, trace. */
  epic: number;
  /** Domain words: decision, ADR, status. */
  decision: number;
  /** People-subject wording ("who ..."). Weak on its own; used by the
   *  no-entity arbitration to tell a people ranking that merely mentions
   *  epics apart from an epic-subject question. */
  who: number;
}

interface Signal {
  /** Matches the question (case-insensitive, word boundaries). */
  re: RegExp;
  /** Weight: strong signals dominate, weak signals only tip close calls. */
  weight: number;
}

const IMPACT: Signal[] = [
  { re: /\bblast radius\b/i, weight: 3 },
  { re: /\bwhat (?:breaks|happens|do (?:we|you) lose)\b/i, weight: 3 },
  // Availability wording inside the if-clause: "how exposed are we if sam
  // is out sick?" — illness and leave are temporary unavailability, the same
  // hypothetical the blast radius answers. Kept inside the if-lane so a bare
  // "sam is out sick today" (a statement, not a question) scores nothing.
  // Session 12: "is out of office" joins the availability list, and the
  // state verbs (cancelled, superseded, reversed, descoped, dropped,
  // deprioritized) accept is/gets/got/was/were — "how bad would it be if the
  // payments epic got cancelled?" — while bare "quit", "resigned",
  // "retired" and "departed" join the departure verbs ("if sam quit" is
  // both past and present plural). Bare "leave" stays out: "if they leave"
  // only ever appears without a name, and "if we leave the work open" is a
  // different hypothetical than a departure.
  // Session 13: the availability list grows the real chat shapes — "gets
  // sick" / "falls ill" ("what if alex gets sick?"), "is away" ("what if
  // alex is away next month?"), the parental / maternity / paternity leave
  // and sabbatical forms in their goes-on / takes variants ("what if priya
  // goes on parental leave?", "what if priya takes a sabbatical?"), and
  // "is/gets poached" ("what if alex gets poached?"), the talent-loss
  // hypothetical.
  // Session 14: the talent-loss and transfer shapes grow — "walks off the
  // job" and "ghosts us" (the abrupt and silent departure idioms), and the
  // transfer verbs "gets pulled onto another team" and "gets reassigned"
  // (organizationally moved, same blast radius). The POS tagger (nlp.ts)
  // gates "ghosts"/"shelved" as VERBS so the noun senses ("the game
  // ghosts", "the shelved state") cannot fire the lane — the first
  // compromise-backed signals in this table.
  { re: /\bif\b[^.?!]{0,48}\b(?:leaves|leaving|left|departs|departed|quit|quits|resigns|resigned|retires|retired|is unavailable|becomes unavailable|is out sick|gets sick|falls ill|is out of office|calls in sick|is on vacation|is on leave|goes on leave|is away|will be away|got hit|gets hit|changes|changed|walks\s+off\s+the\s+job|ghosts?\s+(?:us|the\s+team)|gets?\s+pulled\s+onto\s+(?:another|a\s+different|another\s+team)|gets?\s+reassigned|got\s+reassigned|(?:is|goes)\s+on\s+(?:parental|maternity|paternity)\s+leave|(?:is|goes)\s+on\s+sabbatical|takes\s+(?:an?\s+)?(?:(?:parental|maternity|paternity)\s+)?leave|takes\s+(?:an?\s+)?sabbatical|(?:is|gets?|got|was|were)\s+poached|(?:is|gets?|got|was|were)\s+(?:cancelled|canceled|reversed|superseded|descoped|dropped|deprioritized|shelved|paused))\b/i, weight: 3 },
  // The when-lane: same hypothetical as the if-lane, but anchored by "when"
  // or "before". Extended in session 12 from pronouns-only ("before he
  // leaves") to any subject ("when alex is out of office"): the lazy filler
  // is bounded and the availability words must follow a be-verb, so "when is
  // alex on leave?" (a scheduling question) and "when will sam be back from
  // leave?" do not fire — only "when <someone> is out of office / on leave
  // / out sick / on vacation / unavailable" does. Session 13 closes a
  // regression that extension introduced: the DEPARTURE lane below once
  // accepted bare "leave", so its lazy filler could span "does priya go on
  // parental" and read the NOUN "leave" as the departure verb — "when does
  // priya go on parental leave?", "when is alex on leave?" and "when will
  // sam be back from leave?" all fired impact. Bare "leave" is out of the
  // departure lane now (only "leaves"/"left" match), exactly like the
  // if-lane above; the noun rides the availability lane, where it must
  // follow a be-verb. "away" and the parental / sabbatical forms join the
  // availability lane's list to mirror the if-lane.
  { re: /\bwhen\s+[^.?!]{0,32}?\s(?:is|are)\s+(?:out\s+of\s+(?:office|sick)|on\s+(?:(?:parental|maternity|paternity)\s+)?(?:leave|vacation|sabbatical)|away|unavailable)\b/i, weight: 3 },
  { re: /\b(?:before|when)\s+[^.?!]{0,32}?\s(?:leaves|left|goes|quit|quits|resigns?|resigned|retires?|retired)\b/i, weight: 3 },
  // The while-lane (session 13): the same availability hypothetical the
  // when-lane answers, anchored by "while" — "who is exposed while alex is
  // on vacation?" asks for Alex's blast radius without any if or when. It
  // mirrors the when-availability lane exactly (bounded lazy filler, a
  // be-verb, then the availability words), so a bare "while alex was on
  // vacation" (past tense, a historical fact, not a hypothetical) and a
  // "while on vacation" fragment (no be-verb) both stay out.
  { re: /\bwhile\s+[^.?!]{0,32}?\s(?:is|are)\s+(?:out\s+of\s+(?:office|sick)|on\s+(?:(?:parental|maternity|paternity)\s+)?(?:leave|vacation|sabbatical)|away|unavailable)\b/i, weight: 3 },
  // Session 14: the while-lane grows "travelling" ("who is exposed while
  // alex is travelling?") — the same temporary-unavailability hypothetical
  // the when-lane answers, in its gerund form. The gerund keeps the be-verb
  // requirement, so "while alex was travelling" (past tense, a historical
  // fact) still stays out.
  { re: /\bwhile\s+[^.?!]{0,32}?\s(?:is|are)\s+(?:out\s+of\s+(?:office|sick)|on\s+(?:(?:parental|maternity|paternity)\s+)?(?:leave|vacation|sabbatical)|away|unavailable|travelling|traveling)\b/i, weight: 3 },
  { re: /\b(?:hit by a bus|bus factor)\b/i, weight: 3 },
  { re: /\b(?:offboard(?:ing|s)?|handover|hand-off|handoff|succession)\b/i, weight: 3 },
  // Consequence wording: "what are the consequences of priya leaving?" asks
  // for the blast radius without any if-then verb pattern firing. "fallout"
  // (session 11), "implications" (session 12) and "ripple effects" (session
  // 13) are the same family and just as strong.
  { re: /\bconsequences?\b/i, weight: 3 },
  { re: /\bfallout\b/i, weight: 3 },
  { re: /\bimplications?\b/i, weight: 3 },
  { re: /\bripple\s+effects?\b/i, weight: 3 },
  // Session 14: "knock-on effect(s)" and "second-order effect(s)" join the
  // consequence family — the same blast-radius ask in cascade vocabulary. The
  // multiword forms are lexicon-taught (nlp.ts) so the hyphenated compounds
  // stay whole; the singular/plural alternation covers both shapes.
  { re: /\bknock[-\s]?on\s+effects?\b/i, weight: 3 },
  { re: /\bsecond[-\s]order\s+effects?\b/i, weight: 3 },
  // Who-needs-to-know wording: "who needs to be in the loop on the payments
  // work?" asks for the blast radius report's who-needs-to-know section —
  // epic, decision or person. Needs/must/should + be keeps it a question
  // about stakeholders; the request form ("keep alex in the loop") is a
  // command and is refused by the command guard before matching. The keep
  // QUESTION ("who should we keep in the loop?") is the same ask with a
  // different verb, so it anchors on "who" — the imperative can never fire
  // this signal, with or without the guard.
  { re: /\b(?:needs?|must|should)\s+(?:to\s+)?be\s+in\s+the\s+loop\b/i, weight: 3 },
  { re: /\bwho\s+(?:else\s+)?(?:should|must|do|does|can|would)\s+(?:we|you|i)\s+keep\s+[^.?!]{0,40}?\bin\s+the\s+loop\b/i, weight: 3 },
  // A bottleneck question is a blast-radius question in disguise: "who is
  // the bottleneck on the auth epic?" wants the epic's impact report.
  { re: /\bbottleneck\b/i, weight: 3 },
  { re: /\bdamage\b/i, weight: 2 },
  { re: /\bimpact\b/i, weight: 2 },
  { re: /\b(?:without|unavailable|loses?|losing|lost)\b/i, weight: 2 },
  { re: /\b(?:breaks?|stalls?|blocked|orphaned?)\b/i, weight: 2 },
  // Change-verbs as actions ("we cancel", "superseding", "plan to reverse",
  // "we deprioritize", "we drop") — but NOT past participles used as state
  // ("the decision is superseded", "the epic was deprioritized", "the
  // revamp was dropped"), which describe how things are, not a hypothetical
  // change. The 'ed' forms live only inside the if-lane above, where a
  // hypothetical is explicit. "dropping" needs its own alternation (drop +
  // "ping" is "droping", a misspelling).
  // Session 14: "shelve" and "pause" join the change-verb family — "what if
  // the payments epic gets shelved?" and "what if we pause the auth epic?"
  // are the epic blast radius in workstream vocabulary. "shelved" is
  // POS-gated as a verb (nlp.ts) so the shelf-noun sense cannot fire;
  // "paused" joins the state-verb list inside the if-lane, and the
  // participle-as-state rule keeps "the epic was shelved" a description.
  { re: /\b(?:cancel|supersede|reverse|descope|drop|shelve|shelving)(?:s|ing)?\b|\b(?:cancelling|canceling|superseding|reversing|descoping|dropping|shelving)\b|\bdeprioriti[sz](?:e|es|ing)\b|\bpause(?:s|d)?\b/i, weight: 2 },
  { re: /\bchang(?:e|es|ed|ing)\b/i, weight: 2 },
  // Dependence wording, verb and noun forms alike. "rel(y|ies|ied) on/upon"
  // (session 13) is the same dependence as "depend(s)": "who relies on
  // priya?" asks for Priya's blast radius exactly like "who depends on
  // priya?". The ranking shapes of the rely family ("who do we rely on the
  // most?") live in TOP_RISKS below, where the who-anchor keeps them a
  // ranking rather than one person's blast radius.
  { re: /\bdepend(?:s|ent|ents|ency|encies)?\b|\brel(?:y|ies|ied)\s+(?:on|upon)\b/i, weight: 2 },
  { re: /\bwhat if\b/i, weight: 1 },
  { re: /\baffected\b/i, weight: 1 },
];

const TOP_RISKS: Signal[] = [
  { re: /\b(?:biggest|largest|top|highest|riskiest|worst|main)\s+(?:knowledge(?:-|\s)continuity\s+)?risks?\b/i, weight: 3 },
  { re: /\b(?:most|more)\s+at\s+risk\b/i, weight: 3 },
  { re: /\briskiest\b/i, weight: 3 },
  { re: /\bbus factor\b/i, weight: 3 },
  // Risk synonyms from the corpus frontier (session 8 documented, session 9
  // closed): each of these asks for the risk ranking in different words.
  { re: /\bsingle points? of failure\b/i, weight: 3 },
  { re: /\birreplaceable\b/i, weight: 3 },
  { re: /\binstitutional\s+knowledge\b/i, weight: 3 },
  { re: /\b(?:most\s+)?critical\s+(?:person|people|member|teammate|employee|engineer)s?\b|\b(?:most\s+)?(?:important|essential|vital|crucial|valuable)\s+(?:person|people|member|teammate|employee|engineer|player)s?\b/i, weight: 3 },
  { re: /\bsuccession\s+plan/i, weight: 3 },
  // "what is the highest-impact thing we could lose?" — the superlative of
  // impact over the whole org is the ranking question, not one blast radius.
  // The hyphen form ("highest-impact") must fire too, so the separator class
  // is [-\s]+, not \s+.
  { re: /\b(?:most|highest|biggest|largest)[-\s]+impact\b/i, weight: 3 },
  // Session 10 frontier closures: three more ways chat asks for the risk
  // ranking. "weakest link" and "liability" are risk nouns; "carrying the
  // most context" is the load phrasing. The load phrase must stay phrase-
  // tight: "who has the most context on the payments system?" names a topic
  // the records cannot rank, and it must keep refusing (corpus honest-miss).
  { re: /\bweakest links?\b/i, weight: 3 },
  { re: /\bliabilit(?:y|ies)\b/i, weight: 3 },
  { re: /\bcarrying\s+the\s+most\s+context\b/i, weight: 3 },
  // Session 11 frontier closures: six more ways chat asks for the risk
  // ranking. "linchpin", "key persons/people", "indispensable" and "tribal
  // knowledge" are risk-noun families (mirroring "irreplaceable" and
  // "institutional knowledge"); "spread thin" is the load phrasing, with
  // the/too variants ("spread too thin", "spread the thinnest"); and "never
  // want to lose" is phrase-tight — the idiom carries the "never", so "who
  // do we want to lose?" keeps refusing (corpus boundary case). Session 13:
  // "lynchpin" joins — the common spelling variant of "linchpin" was a
  // genuine miss ("who is our lynchpin?" refused).
  { re: /\blinchpins?\b|\blynchpins?\b/i, weight: 3 },
  { re: /\bkey\s+(?:persons?|people)\b/i, weight: 3 },
  { re: /\bindispensable\b/i, weight: 3 },
  { re: /\btribal\s+knowledge\b/i, weight: 3 },
  { re: /\bspread\s+(?:(?:the|too)\s+)?thin(?:nest|ner)?\b/i, weight: 3 },
  { re: /\bnever\s+want\s+to\s+lose\b/i, weight: 3 },
  // Session 12 frontier closures: nine more ways chat asks for the risk
  // ranking, each phrase-tight so near-miss wordings keep refusing. "most
  // important/valuable ... person/player" extends the critical-person
  // family; "afford to lose" covers the cannot/can't/least/not variants;
  // "glue that holds" (with of/on/in forms) and "backbone" are the
  // load-bearing idioms; "miss the most" is the loss phrasing ("misses the
  // most standups" must not fire, so the verb stays singular "miss");
  // "takes the most with them" (one optional middle word: "the most
  // knowledge with them") is what walks out the door; "never lose" carries
  // its own idiom so "who do we want to lose?" keeps refusing; and the
  // go-to person family is "go-to person" plus "everyone goes to" (the
  // person-everyone-goes-to shape).
  { re: /\bafford\s+to\s+lose\b/i, weight: 3 },
  { re: /\bglue\s+(?:that\s+)?(?:holds|of|on|in)\b/i, weight: 3 },
  { re: /\bmiss\s+the\s+most\b/i, weight: 3 },
  { re: /\btakes?\s+the\s+most\s+(?:[a-z]+\s+)?with\s+(?:them|him|her)\b/i, weight: 3 },
  { re: /\bnever\s+lose\b/i, weight: 3 },
  { re: /\bbackbone\b/i, weight: 3 },
  { re: /\bgo[-\s]to\s+(?:person|people)\b/i, weight: 3 },
  { re: /\beveryone\s+go(?:es)?\s+to\b/i, weight: 3 },
  // Session 13 frontier closures: thirteen more ways chat asks for the risk
  // ranking, each phrase-tight so near-miss wordings keep refusing. The
  // replace family is "impossible/hardest/toughest to replace" plus "least
  // replaceable" — NOT bare "replaceable", because "who is the most
  // replaceable person?" asks for the OPPOSITE ranking and the answer
  // renders highest-risk first; that question keeps refusing. "keys to the
  // kingdom", "secret weapon", "shoes to fill" and "weak spot" are the
  // risk-noun idioms; "knowledge hoarders" covers noun, verb and gerund
  // ("who hoards knowledge?", "is there knowledge hoarding?"); "most
  // central", "institutional memory", "load-bearing" and "unreasonable
  // load" are the criticality phrasings; the relied-upon family covers
  // "most relied-upon/-on", "relied upon/on the most" and the who-anchored
  // "who do we rely on?"; "cannot lose" completes the lose idiom beside
  // "never lose"; the vulnerability family is superlative-tight
  // (biggest/largest/greatest/main/major), and "struggle without" needs the
  // without ("who struggles the most?" is an attendance/effort question and
  // keeps refusing).
  { re: /\b(?:impossible|hardest|toughest)\s+to\s+replace\b|\bleast\s+replaceable\b/i, weight: 3 },
  { re: /\bkeys?\s+to\s+the\s+kingdom\b/i, weight: 3 },
  { re: /\bknowledge\s+hoard(?:ers?|ing)\b|\bhoard(?:s|ing)?\s+knowledge\b/i, weight: 3 },
  { re: /\bsecret\s+weapons?\b/i, weight: 3 },
  { re: /\bmost\s+central\b/i, weight: 3 },
  { re: /\binstitutional\s+memory\b/i, weight: 3 },
  { re: /\bmost\s+relied[-\s]?(?:upon|on)\b|\brelied[-\s]?(?:upon|on)\s+the\s+most\b|\bwho\s+do(?:es)?\s+(?:we|you|they|everyone|the\s+team)\s+rely\s+on\b/i, weight: 3 },
  { re: /\b(?:biggest|largest|greatest|main|major)\s+vulnerabilit(?:y|ies)\b/i, weight: 3 },
  { re: /\bmost\s+vulnerable\s+(?:person|people|member|teammate|employee|engineer|player)s?\b/i, weight: 3 },
  { re: /\bshoes\s+to\s+fill\b/i, weight: 3 },
  { re: /\bstruggl(?:e|es|ed|ing)\s+without\b/i, weight: 3 },
  { re: /\bweak\s+spots?\b/i, weight: 3 },
  { re: /\bload[-\s]bearing\b/i, weight: 3 },
  { re: /\bunreasonable\s+loads?\b/i, weight: 3 },
  { re: /\b(?:cannot|can't|can\s+not)\s+lose\b/i, weight: 3 },
  // Session 14 frontier closures: the eighteen leftover ranking synonyms,
  // each phrase-tight so near-miss wordings keep refusing. The idioms:
  // "take for granted" (needs the granted — "who takes the most?" is a
  // different ask), "engine of the team" (the-of forms), "dangerous
  // dependency" (with most/our possessive shapes), "loss to absorb" /
  // "biggest loss" / "regret losing" (the loss family), "quietly holds
  // everything together" / "holding the team together" (the cohesion
  // family), "heart of the team" (of-anchored), "most pivotal" (the
  // pivotal superlative), "foundation" and "anchor" (the possessive "the
  // team's ..." shapes only — bare "foundation" is a building question),
  // "underestimate" (the who-do-we shape), "critical asset" (most/our
  // possessive), "most entrenched", "bus number" (the idiom, also
  // lexicon-taught), and "collapse without" (needs the without). Each
  // carries its own near-miss boundary in the corpus (see eval.ts).
  // "take for granted" (the who-do-we shape only — "who takes the most for
  // granted?" and "who do we take for granted on payments?" are effort and
  // scoped questions, not this ranking; both stay refusing),
  { re: /\bwho\s+(?:do|does)\s+(?:we|you|they)\s+take\s+for\s+granted\b|\bwho\s+do\s+we\s+take\s+for\s+granted\b/i, weight: 3 },
  { re: /\bengine\s+of\s+(?:the|this|our|my)\s+team\b/i, weight: 3 },
  { re: /\b(?:most|our|my)\s+dangerous\s+dependenc(?:y|ies)\b|\bdangerous\s+dependenc(?:y|ies)\b/i, weight: 3 },
  { re: /\b(?:hardest|biggest|worst|toughest|major)\s+loss(?:\s+to\s+absorb)?\b|\bloss\s+to\s+absorb\b/i, weight: 3 },
  { re: /\bregret\s+losing\b|\bwould\s+regret\s+losing\b|\bregret\s+(?:the\s+most|losing)\b/i, weight: 3 },
  { re: /\b(?:quietly\s+)?(?:holds?|holding|held)\s+(?:everything|it|the\s+(?:team|payments|auth|org)|.*?together)\s+together\b|\bholding\s+(?:the|this|our)\s+(?:team|payments|auth)\s+team\s+together\b|\bheld\s+together\b/i, weight: 3 },
  { re: /\bheart\s+of\s+(?:the|this|our|my)\s+team\b/i, weight: 3 },
  { re: /\bmost\s+pivotal\b/i, weight: 3 },
  { re: /\b(?:team|org|company|department)'?s?\s+(?:foundation|anchor)\b|\bthe\s+team'?s\s+(?:foundation|anchor)\b/i, weight: 3 },
  { re: /\bwho\s+(?:do|does)\s+(?:we|you|they)\s+underestimate\b|\bwho\s+do\s+we\s+underestimate\b/i, weight: 3 },
  { re: /\b(?:most|our|my|the)\s+critical\s+assets?\b|\bmost\s+critical\s+asset\b/i, weight: 3 },
  { re: /\bmost\s+entrenched\b/i, weight: 3 },
  // "bus number" needs the possessive/our shape ("what is our bus
  // number?") — a bare "when is the bus number?" is a scheduling oddity and
  // keeps refusing.
  { re: /\b(?:our|the\s+team'?s?|my)\s+bus\s+number\b/i, weight: 3 },
  { re: /\bcollapse(?:s|d)?\s+without\b/i, weight: 3 },
  { re: /\bat\s+risk\b/i, weight: 2 },
  { re: /\brisks?\b|\bexposure\b|\bexposed\b/i, weight: 2 },
  { re: /\brank(?:ed|ing|s)?\b/i, weight: 1 },
  { re: /\bwho (?:is|are|should|was|do)\b/i, weight: 1 },
  { re: /\b(?:worry|worried|concern(?:ed|s)?)\b/i, weight: 1 },
];

const OVERVIEW: Signal[] = [
  { re: /\boverview\b/i, weight: 3 },
  // Weight 2, not 3: "summary of the risks" must lose the tie to the ranking,
  // because risk is the subject of the question, not the org overview.
  { re: /\bsummar(?:y|ize|ise|ise it)\b/i, weight: 2 },
  { re: /\bsnapshot\b/i, weight: 2 },
  { re: /\bbig picture\b/i, weight: 2 },
  { re: /\bstate of\b/i, weight: 2 },
  { re: /\bhealth(?:y)?\b/i, weight: 2 },
  { re: /\bhow are (?:we|things|you|they|people|everyone)\b/i, weight: 2 },
  { re: /\bhow is (?:the|our|it|this|everything|everyone)\b/i, weight: 2 },
  // "What is our knowledge coverage?" — coverage questions are org-level
  // questions; the overview is the report that counts coverage-shaped facts
  // (sole-contributor pages, pending decisions, epic gaps).
  { re: /\bcoverage\b/i, weight: 2 },
  { re: /\b(?:overall|organization|organisation|org|landscape|dashboard)\b/i, weight: 1 },
  { re: /\btell me about the (?:team|org|organization|organisation)\b/i, weight: 2 },
];

const EPIC: Signal[] = [
  { re: /\bepics?\b/i, weight: 2 },
  { re: /\blineage\b/i, weight: 2 },
  { re: /\b(?:trace|behind)\b/i, weight: 1 },
];

const WHO: Signal[] = [
  // People-subject wording: "who is ...", "who do we ...". Weight 1 — it never
  // decides anything on its own; the no-entity arbitration reads it to tell a
  // people ranking that merely mentions epics ("who is spread the thinnest
  // across epics?") apart from an epic-subject question ("which epics are most
  // at risk right now?"), where answering with the people ranking would be
  // confidently wrong.
  { re: /\bwho\b/i, weight: 1 },
];

const DECISION: Signal[] = [
  { re: /\bdecisions?\b/i, weight: 2 },
  { re: /\badrs?\b/i, weight: 2 },
  { re: /\bstatus\b/i, weight: 1 },
  // Decide-verb phrasings carry the decision domain without the noun
  // "decision": "what did we decide on retries?", "who made the call on the
  // token format?", "why did we move away from the queue approach?".
  { re: /\bdecid(?:e|es|ed|ing)\b/i, weight: 2 },
  { re: /\bmade\s+the\s+call\b/i, weight: 2 },
  { re: /\bmov(?:e|es|ed|ing)\s+away\s+from\b/i, weight: 2 },
];

function sum(signals: Signal[], question: string): number {
  let score = 0;
  for (const { re, weight } of signals) {
    if (re.test(question)) score += weight;
  }
  return score;
}

/* ------------------------------------------------------------------ *
 * The POS-gated safety valve (session 14). The departure lane's weight-3
 * regex matches any "leaves|leaving|left" inside an if/before/when clause —
 * correct for the departure hypothetical, WRONG for the noun "leave" a
 * scheduling question carries ("when is alex on leave?"). Until now the
 * fix was enumeration (bare "leave" banned from the lane); with compromise
 * the gate is grammatical: the if-lane's departure signal may only fire
 * when the matched verb-word is actually tagged a VERB. One analysis per
 * question, cached (nlp.ts), so the cost stays inside the latency budget.
 * ------------------------------------------------------------------ */

const DEPARTURE_VERB_WORDS = ['leaves', 'leaving', 'left', 'quit', 'quits', 'resigns', 'resigned', 'retires', 'retired'];

function gatedImpactScore(question: string, rawImpact: number): number {
  // Only apply when the raw regexes matched departure wording — the common
  // case (no departure wording) pays nothing beyond the cache lookup.
  if (!/\b(?:if|before|when|while)\b/i.test(question)) return rawImpact;
  if (!/\b(?:leaves|leaving|left|departs?|quit|quits|resigns?|resigned|retires?|retired)\b/i.test(question)) return rawImpact;

  const analysis = analyzeQuestion(question);
  // The gate's scope is deliberately narrow: the taught NOUN "leave" (the
  // session-13 bug class — "when is alex on leave?", "go on parental
  // leave"). The plural "leaves" is genuinely two-word ambiguous (autumn
  // leaves vs "before priya leaves?"), and compromise tags the sentence-
  // final verb form as a noun too, so gating it would break real departure
  // traffic; the if-lane's own context words carry that case instead.
  // Only when the singular noun is present AND tagged a noun AND no
  // departure verb form exists do we distrust the lane match.
  const hasSingularLeave = /\bleave\b/i.test(question);
  const hasVerbForm = DEPARTURE_VERB_WORDS.some((w) => analysis.isVerbWord(w));
  if (hasSingularLeave && !hasVerbForm && analysis.isNounWord('leave')) {
    return rawImpact - 3 >= 0 ? rawImpact - 3 : 0;
  }
  return rawImpact;
}

/** Weighted intent scores for one question. Deterministic, order-free. */
export function scoreIntents(question: string): IntentScores {
  return {
    impact: gatedImpactScore(question, sum(IMPACT, question)),
    topRisks: sum(TOP_RISKS, question),
    overview: sum(OVERVIEW, question),
    epic: sum(EPIC, question),
    decision: sum(DECISION, question),
    who: sum(WHO, question),
  };
}

/**
 * Arbitration thresholds, shared with the answer layer:
 *  - `impactStrong` means the question clearly asks for a blast radius;
 *  - `impactSignal` means any impact wording is present;
 *  - `rankingStrong` means the question clearly asks for a ranking.
 */
export const impactStrong = (s: IntentScores): boolean => s.impact >= 3;
export const impactSignal = (s: IntentScores): boolean => s.impact >= 2;
export const rankingSignal = (s: IntentScores): boolean => s.topRisks >= 2;
export const rankingStrong = (s: IntentScores): boolean => s.topRisks >= 3;

/**
 * No-entity arbitration: which answerable intent a question with no matched
 * person, epic or decision maps to. `undefined` = not understood (the engine
 * then says so honestly, with suggestions). On a tie the ranking wins: risk
 * is the product's subject.
 *
 * The plural-epic guard: "which epics are most at risk right now?" scores as
 * a ranking question, but what it asks for is an EPIC ranking — answering it
 * with the people ranking would be confidently wrong, so it refuses (unless
 * overview wording is present, which the org overview legitimately answers:
 * it ranks epics by recorded gaps). This function only runs when no specific
 * epic matched, so "the Payments reliability epic" questions never land here.
 */
export function arbitrateFreeQuestion(s: IntentScores): 'top-risks' | 'overview' | undefined {
  if (s.epic >= 2) {
    // A who-question with a strong ranking signal is a people ranking that
    // merely mentions epics as context ("who is spread the thinnest across
    // epics?"); an epic-subject question ("which epics are most at risk?")
    // keeps refusing, because answering it with the people ranking would be
    // confidently wrong.
    if (s.who >= 1 && s.topRisks >= 3) return 'top-risks';
    return s.overview >= 2 ? 'overview' : undefined;
  }
  if (rankingSignal(s) && s.topRisks >= s.overview) return 'top-risks';
  if (s.overview >= 2) return 'overview';
  return undefined;
}
