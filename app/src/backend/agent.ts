import type { AnswerResult, OrgGraph } from '@traceflow/core';
import { ANSWERABLE_QUESTIONS, answerQuery } from '@traceflow/core';
import { loadSanitizedSiteGraph } from './site-graph';

/**
 * TF-04: the Rovo agent action. The whole contract in one paragraph:
 *
 * Rovo's model extracts the `question` input from the chat, Forge invokes this
 * function with it, and the function returns an `AnswerResult` produced by the
 * deterministic engine (`answerQuery`) — the same answer layer the MCP server
 * and the Workbench sit on. The model may then phrase the payload for the user;
 * it may never originate facts, because the payload already carries the full
 * deterministic answer, its evidence records and its caveats, and the agent's
 * prompt (app/manifest.yml) instructs the model to relay them without adding
 * people, record ids, titles or numbers of its own. That is the no-LLM-trust
 * model (docs/ARCHITECTURE.md) applied to the one surface whose model layer we
 * cannot intercept: the engine's own words are always inside the payload.
 *
 * UNVERIFIED against the Rovo runtime until spike S3 (docs/SPIKES.md); the
 * handler shapes follow the Forge action documentation (payload carries the
 * inputs plus a context object with Atlassian app identifiers).
 */

/**
 * Action inputs are extracted by a model, so they are untrusted: cap the
 * length, tolerate any type, and never let them drive anything but the
 * question text. Read-only action (actionVerb: GET) — no authorization
 * decision ever depends on these values.
 */
const MAX_QUESTION_LENGTH = 500;

/** The payload shape Forge passes to an action handler (from the Forge docs; UNVERIFIED in the runtime). */
export interface RovoActionPayload {
  question?: unknown;
  context?: {
    cloudId?: string;
    moduleKey?: string;
    jira?: { url?: string };
    confluence?: { url?: string };
  };
}

export interface InvestigateDeps {
  /** Loads the sanitized site graph; the site url is only used to build record links. */
  loadGraph: (siteUrl?: string) => Promise<OrgGraph>;
  /** Logs failures; injected so tests can observe it. */
  logError?: (message: string, err: unknown) => void;
}

const DEFAULT_LOG_ERROR = (message: string, err: unknown): void => {
  console.error(message, err);
};

/** The honest-miss payload: same shape as the engine's, so the model sees one contract. */
function miss(question: string, answer: string, withSuggestions: boolean): AnswerResult {
  return {
    intent: 'overview',
    understood: false,
    question,
    answer,
    data: null,
    evidence: [],
    caveats: [],
    ...(withSuggestions ? { suggestions: ANSWERABLE_QUESTIONS.map((q) => q.example) } : {}),
  };
}

/**
 * The site url is only used to build record links in the graph. In issue or
 * page views the action payload carries that view's url; in chat it does not,
 * and the graph is then built without urls — honest, and the cached entry is
 * shared with the Workbench resolver either way.
 */
function siteUrlFromPayload(payload: RovoActionPayload): string | undefined {
  const raw = payload.context?.jira?.url ?? payload.context?.confluence?.url;
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

/** Build the action handler with injectable dependencies (tests pass their own). */
export function createInvestigateAction(deps: InvestigateDeps) {
  return async function investigate(payload: RovoActionPayload): Promise<AnswerResult> {
    // 1. Validate the model-extracted input before it reaches the engine.
    const question = typeof payload?.question === 'string' ? payload.question.trim() : '';
    if (question.length === 0) {
      return miss(
        '',
        'No question was provided. Ask one like "What are the biggest knowledge risks right now?"',
        true,
      );
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      return miss(question, 'That question is too long for the engine. Ask a shorter one.', false);
    }

    // 2. Load the site graph through the same cache and pipeline as the resolver.
    let graph: OrgGraph;
    try {
      graph = await deps.loadGraph(siteUrlFromPayload(payload));
    } catch (err) {
      (deps.logError ?? DEFAULT_LOG_ERROR)('traceflow agent: could not load the site graph', err);
      return miss(
        question,
        'The connected records could not be read just now. Try again in a moment.',
        false,
      );
    }

    // 3. Answer deterministically; the engine says so itself when it cannot map
    //    the question, lists what it can answer, and never guesses.
    return answerQuery(graph, question);
  };
}

/** The handler the manifest points at (`backend/agent.investigate`). */
export const investigate = createInvestigateAction({
  loadGraph: (siteUrl) => loadSanitizedSiteGraph(siteUrl),
});
