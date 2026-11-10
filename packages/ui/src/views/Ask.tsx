import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { answerQuery } from '@traceflow/core';
import type { AnswerIntent, AnswerResult, OrgGraph, RecordRef } from '@traceflow/core';
import { Caveats } from '../components/Caveats';
import { EmptyState } from '../components/States';
import { RecordRow } from '../components/Evidence';
import { GraphGate } from '../components/Gate';
import { go, hrefFor, useRoute } from '../router';

/**
 * The Ask view: the deterministic answer layer (answerQuery) as a first-class
 * Workbench surface. No model, no network: the question maps to one of the
 * eight answerable intents, the answer is the engine's own words, and every
 * answer carries its supporting records, its caveats and a deep link into the
 * matching investigation view. A miss is honest — the engine says so and
 * offers the questions it can answer.
 *
 * The question lives in the URL (`#/ask/<encoded question>`), so an answered
 * question can be shared, bookmarked and restored exactly.
 */

const INTENT_LABEL: Record<AnswerIntent, string> = {
  overview: 'Organization overview',
  'top-risks': 'Knowledge-risk ranking',
  'person-risk': 'Person risk profile',
  'person-impact': 'Person blast radius',
  'epic-lineage': 'Epic lineage',
  'epic-impact': 'Epic blast radius',
  'decision-trace': 'Decision trace',
  'decision-impact': 'Decision blast radius',
};

/** Curated starters: one per question family, phrased the way chat arrives. */
const STARTERS: readonly string[] = [
  'What are the biggest knowledge risks right now?',
  'What breaks if Alex leaves?',
  'Who is the payments single point of failure?',
  'Which decision is blocking the payments work?',
  'Give me an overview of the organization',
];

export function AskView() {
  return <GraphGate label="Loading the answer layer">{(graph) => <AskReady graph={graph} />}</GraphGate>;
}

function ask(question: string): void {
  const q = question.trim();
  if (q) go({ view: 'ask', id: q }, true);
}

function AskReady({ graph }: { graph: OrgGraph }) {
  const route = useRoute();
  const question = route.view === 'ask' ? route.id?.trim() : undefined;
  // The input is local state, synced from the URL so chips, suggestions,
  // back/forward and shared links all fill it consistently.
  const [draft, setDraft] = useState(question ?? '');
  useEffect(() => {
    setDraft(question ?? '');
  }, [question]);

  const result = useMemo(() => (question ? answerQuery(graph, question) : null), [graph, question]);

  if (graph.people.length === 0 && graph.workItems.filter((w) => w.type === 'epic').length === 0 && graph.decisions.length === 0) {
    return (
      <div className="workspace workspace-single">
        <EmptyState title="Nothing to ask about yet">
          Connect a Jira or Confluence site and TraceFlow will answer questions about the people, epics and decisions it finds there.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="workspace workspace-single">
      <div className="main">
        <header className="page-head">
          <h1>Ask TraceFlow</h1>
          <p className="lead">
            Plain-language questions answered from the connected records: deterministic, evidence-first, no model involved. Every answer
            shows its supporting records, its limits, and links into the matching investigation.
          </p>
        </header>

        <form
          className="ask-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <label htmlFor="ask-input" className="visually-hidden">
            Your question
          </label>
          <input
            id="ask-input"
            className="ask-input"
            type="text"
            autoComplete="off"
            placeholder="What breaks if Alex leaves?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn" disabled={draft.trim().length === 0}>
            Ask
          </button>
        </form>

        <p className="ask-starters-label">Try one of these:</p>
        <ul className="ask-starters">
          {STARTERS.map((q) => (
            <li key={q}>
              <button type="button" className="chip" onClick={() => ask(q)}>
                {q}
              </button>
            </li>
          ))}
        </ul>

        {result ? <AnswerCard result={result} /> : null}
      </div>
    </div>
  );
}

/** The deep link into the investigation the answer came from, per intent. */
function investigationHref(result: AnswerResult): string | undefined {
  if (!result.understood) return undefined;
  const data = result.data as
    | { personId?: string; epic?: { id?: string }; decision?: { id?: string } }
    | null;
  switch (result.intent) {
    case 'person-risk':
      return data?.personId ? hrefFor({ view: 'people', id: data.personId }) : undefined;
    case 'person-impact':
      return data?.personId ? hrefFor({ view: 'impact', id: data.personId }) : undefined;
    case 'epic-lineage':
      return data?.epic?.id ? hrefFor({ view: 'epics', id: data.epic.id }) : undefined;
    case 'epic-impact':
      return data?.epic?.id ? hrefFor({ view: 'impact', kind: 'epic', id: data.epic.id }) : undefined;
    case 'decision-trace':
      return data?.decision?.id ? hrefFor({ view: 'decisions', id: data.decision.id }) : undefined;
    case 'decision-impact':
      return data?.decision?.id ? hrefFor({ view: 'impact', kind: 'decision', id: data.decision.id }) : undefined;
    case 'top-risks':
      return hrefFor({ view: 'people' });
    case 'overview':
      return hrefFor({ view: 'overview' });
  }
}

/** Dedupe by source:id, keeping first occurrence: the same record can
 *  support several findings, and the answer's evidence may list it twice. */
function uniqueRecords(refs: readonly RecordRef[]): RecordRef[] {
  const seen = new Set<string>();
  const out: RecordRef[] = [];
  for (const r of refs) {
    const key = `${r.source}:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function AnswerCard({ result }: { result: AnswerResult }) {
  const investigation = investigationHref(result);
  if (!result.understood) {
    return (
      <section className="ask-result" aria-labelledby="ask-question-heading">
        <h2 id="ask-question-heading" className="ask-question">
          {result.question}
        </h2>
        <p className="ask-verdict">
          <span className="ask-intent">Not answered</span>
        </p>
        <p className="ask-text">{result.answer}</p>
        {result.suggestions && result.suggestions.length > 0 ? (
          <>
            <p className="ask-starters-label">Did you mean:</p>
            <ul className="ask-starters">
              {result.suggestions.slice(0, 4).map((q) => (
                <li key={q}>
                  <button type="button" className="chip" onClick={() => ask(q)}>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    );
  }
  return (
    <section className="ask-result" aria-labelledby="ask-question-heading">
      <h2 id="ask-question-heading" className="ask-question">
        {result.question}
      </h2>
      <p className="ask-verdict">
        <span className="ask-intent">{INTENT_LABEL[result.intent]}</span>
        {investigation ? (
          <a className="ask-investigation" href={investigation}>
            Open the investigation
          </a>
        ) : null}
      </p>
      <p className="ask-text">{result.answer}</p>
      {result.evidence.length > 0 ? (
        <>
          <h3 className="ask-evidence-title">Supporting records</h3>
          <ul className="records">
            {uniqueRecords(result.evidence).map((r) => (
              <RecordRow record={r} key={`${r.source}:${r.id}`} />
            ))}
          </ul>
        </>
      ) : null}
      <Caveats items={result.caveats} />
    </section>
  );
}
