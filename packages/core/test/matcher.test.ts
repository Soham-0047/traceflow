import { describe, expect, it } from 'vitest';
import { matchDecision, matchEpic, matchPerson, resolveDecisionId, resolveEpic, resolvePerson } from '../src/matcher.js';
import { sampleGraph } from '../src/fixtures.js';
import type { OrgGraph } from '../src/types.js';

describe('matchPerson', () => {
  it('matches by exact id, bare id word, full name and last name', () => {
    expect(matchPerson(sampleGraph, 'alex').person?.id).toBe('alex');
    expect(matchPerson(sampleGraph, 'What is the risk around alex?').person?.id).toBe('alex');
    expect(matchPerson(sampleGraph, 'What about Alex Rivera?').person?.id).toBe('alex');
    expect(matchPerson(sampleGraph, 'risk profile for rivera').person?.id).toBe('alex');
  });

  it('tolerates typos in name tokens', () => {
    expect(matchPerson(sampleGraph, 'risk around Alexs Rivera').person?.id).toBe('alex');
    expect(matchPerson(sampleGraph, 'risk around alex riveria').person?.id).toBe('alex');
  });

  it('accepts a 3-letter fragment one edit from a longer name', () => {
    // 'alx' -> 'alex': a truncated name, not a different word.
    expect(matchPerson(sampleGraph, 'what is the risk around Alx?').person?.id).toBe('alex');
  });

  it('matches reordered name tokens', () => {
    expect(matchPerson(sampleGraph, 'what do we know about rivera alex').person?.id).toBe('alex');
  });

  it('reports ambiguity instead of guessing when tokens tie', () => {
    const graph: OrgGraph = {
      ...sampleGraph,
      people: [...sampleGraph.people, { id: 'samir', name: 'Samir Gupta' }],
    };
    const match = matchPerson(graph, 'What is the risk around Sam?');
    expect(match.person).toBeUndefined();
    expect(match.ambiguous?.map((p) => p.id).sort()).toEqual(['sam', 'samir']);
  });

  it('treats a first name plus a different surname as ambiguous, not a silent winner', () => {
    // 'alex chen' mixes Alex Rivera's first name with Sam Chen's surname.
    const match = matchPerson(sampleGraph, "what is alex chen's risk?");
    expect(match.person).toBeUndefined();
    expect(match.ambiguous?.map((p) => p.id).sort()).toEqual(['alex', 'sam']);
  });

  it('flags a capitalized unknown mention instead of matching nobody silently', () => {
    expect(matchPerson(sampleGraph, 'What is the weather on Mars?').unmatchedMention).toBe('Mars');
  });

  it('is deterministic across record order (stable ranking by score then id)', () => {
    const shuffled: OrgGraph = {
      ...sampleGraph,
      people: [...sampleGraph.people].reverse(),
    };
    for (const q of ['Tell me about alex', 'risk around sam chen', 'what about priya']) {
      expect(matchPerson(shuffled, q).person?.id).toBe(matchPerson(sampleGraph, q).person?.id);
    }
  });
});

describe('matchEpic', () => {
  it('matches by key in any case', () => {
    expect(matchEpic(sampleGraph, 'Trace the epic PAY-1').epicId).toBe('PAY-1');
    expect(matchEpic(sampleGraph, 'trace pay-1').epicId).toBe('PAY-1');
  });

  it('matches by full title, reordered tokens and typoed tokens', () => {
    expect(matchEpic(sampleGraph, 'what is behind Payments reliability?').epicId).toBe('PAY-1');
    expect(matchEpic(sampleGraph, 'trace the epic payments reliablity').epicId).toBe('PAY-1');
  });

  it('matches a distinctive token only with a domain word', () => {
    expect(matchEpic(sampleGraph, 'trace the auth epic').epicId).toBe('AUTH-1');
    // No domain word: 'the payments service' is not an epic question.
    expect(matchEpic(sampleGraph, 'how do i deploy the payments service?').epicId).toBeUndefined();
  });

  it('does not match an epic question that names none', () => {
    expect(matchEpic(sampleGraph, 'What breaks if the epic changes?').epicId).toBeUndefined();
  });
});

describe('matchDecision', () => {
  it('matches by id (whole question or bare token)', () => {
    expect(matchDecision(sampleGraph, 'd2').decisionId).toBe('d2');
    expect(matchDecision(sampleGraph, 'what is d1 about?').decisionId).toBe('d1');
  });

  it('matches by full title tokens in any order', () => {
    expect(matchDecision(sampleGraph, 'the scope idempotency key decision').decisionId).toBe('d3');
  });

  it('matches a distinctive token with a decision-domain word', () => {
    expect(matchDecision(sampleGraph, 'status of the idempotency decision?').decisionId).toBe('d3');
    expect(matchDecision(sampleGraph, 'show me the retries decision').decisionId).toBe('d1');
  });

  it('does not let a short shared token like "key" anchor a match', () => {
    // 'key' comes from "idempotency key scope" but "the key decision" is
    // generic English; 3-char anchors are below the record lane's bar.
    expect(matchDecision(sampleGraph, 'what is the status of the key decision?').decisionId).toBeUndefined();
  });
});

describe('resolvers (tool-surface API)', () => {
  it('resolvePerson: id, name, typo; helpful errors otherwise', () => {
    expect(resolvePerson(sampleGraph, 'alex').id).toBe('alex');
    expect(resolvePerson(sampleGraph, 'Alex Rivera').id).toBe('alex');
    expect(resolvePerson(sampleGraph, 'Alexs Rivera').id).toBe('alex');
    expect(() => resolvePerson(sampleGraph, 'nobody')).toThrow(/No person matches/);
  });

  it('resolvePerson: ambiguity carries the candidates', () => {
    try {
      resolvePerson(sampleGraph, 'alex chen');
      expect.unreachable('must throw');
    } catch (err) {
      expect((err as { code: string }).code).toBe('ambiguous');
      expect((err as { candidates: string[] }).candidates.sort()).toEqual(['Alex Rivera', 'Sam Chen']);
    }
  });

  it('resolveEpic: key any case, title, distinctive token', () => {
    expect(resolveEpic(sampleGraph, 'pay-1').ref.id).toBe('PAY-1');
    expect(resolveEpic(sampleGraph, 'Onboarding revamp').ref.id).toBe('ONB-1');
    expect(resolveEpic(sampleGraph, 'the payments epic').ref.id).toBe('PAY-1');
    expect(() => resolveEpic(sampleGraph, 'nope')).toThrow(/No epic matches/);
  });

  it('resolveDecisionId: id, title, distinctive token', () => {
    expect(resolveDecisionId(sampleGraph, 'd3')).toBe('d3');
    expect(resolveDecisionId(sampleGraph, 'idempotency key scope')).toBe('d3');
    expect(resolveDecisionId(sampleGraph, 'token format decision')).toBe('d2');
    expect(() => resolveDecisionId(sampleGraph, 'nope')).toThrow(/No decision matches/);
  });
});

describe('matcher index cache (session 9)', () => {
  it('returns identical results on repeated calls over the same graph', () => {
    const questions = [
      'What is the risk around Alex Rivera?',
      'trace the auth hardening epic',
      'status of the idempotency decision?',
      'who is the bottleneck on the payments epic?',
    ];
    for (const q of questions) {
      expect(JSON.stringify(matchPerson(sampleGraph, q)), q).toBe(JSON.stringify(matchPerson(sampleGraph, q)));
      expect(JSON.stringify(matchEpic(sampleGraph, q)), q).toBe(JSON.stringify(matchEpic(sampleGraph, q)));
      expect(JSON.stringify(matchDecision(sampleGraph, q)), q).toBe(JSON.stringify(matchDecision(sampleGraph, q)));
    }
  });

  it('interleaved calls do not corrupt the cached token structures', () => {
    // Warm the cache with a first question, then confirm a different
    // question still matches correctly (cache holds all records, not the
    // last question's leftovers).
    matchEpic(sampleGraph, 'trace pay-1');
    expect(matchEpic(sampleGraph, 'What is behind the Onboarding revamp epic?').epicId).toBe('ONB-1');
    matchDecision(sampleGraph, 'status of decision d3?');
    expect(matchDecision(sampleGraph, 'what happened with the token format decision?').decisionId).toBe('d2');
    expect(matchPerson(sampleGraph, 'how much risk does sam chen carry?').person?.id).toBe('sam');
  });
});

describe('matchDecision — session 10: decide-verb domain phrases', () => {
  it('anchors decide-verb questions to the right decision', () => {
    // "retry" reaches d1 through the inflectional lane ("retries" title token).
    expect(matchDecision(sampleGraph, 'what did we decide about the retry mechanism?')).toEqual({ decisionId: 'd1' });
    expect(matchDecision(sampleGraph, 'what did we decide on retries?')).toEqual({ decisionId: 'd1' });
    expect(matchDecision(sampleGraph, 'why did we move away from the queue approach?')).toEqual({ decisionId: 'd1' });
    expect(matchDecision(sampleGraph, 'what did we decide about the token format?')).toEqual({ decisionId: 'd2' });
    expect(matchDecision(sampleGraph, 'what did the team decide on the idempotency key scope?')).toEqual({ decisionId: 'd3' });
  });

  it('still refuses decide questions about unknown subjects', () => {
    // The domain phrase opens the anchor lane; it must not invent matches.
    expect(matchDecision(sampleGraph, 'what did we decide about the offsite?')).toEqual({});
    expect(matchDecision(sampleGraph, 'what did we decide about lunch?')).toEqual({});
  });

  it('keeps topic-knowledge questions out of the decision domain', () => {
    // No decide wording, no decision noun: the anchor lane stays closed.
    expect(matchDecision(sampleGraph, 'who knows the most about the auth service?')).toEqual({});
  });
});
