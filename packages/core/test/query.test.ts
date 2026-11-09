import { describe, expect, it } from 'vitest';
import { answerQuery, ANSWERABLE_QUESTIONS } from '../src/index.js';
import { sampleGraph } from '../src/fixtures.js';
import type { OrgGraph } from '../src/index.js';

describe('answerQuery — the six answerable intents', () => {
  it('answers top-risks questions with the ranked list', () => {
    const result = answerQuery(sampleGraph, 'What are the biggest knowledge risks right now?');
    expect(result.understood).toBe(true);
    expect(result.intent).toBe('top-risks');
    expect(result.answer).toContain('Alex Rivera');
    expect(result.answer).toContain('63');
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('answers person-risk questions by name, full name or id', () => {
    for (const q of ['What is the risk around Alex Rivera?', 'risk around alex rivera', 'Tell me about alex']) {
      const result = answerQuery(sampleGraph, q);
      expect(result.understood, q).toBe(true);
      expect(result.intent).toBe('person-risk');
      expect(result.answer).toContain('Alex Rivera');
      expect(result.answer).toContain('score of 63');
    }
    const byId = answerQuery(sampleGraph, 'What is the risk around alex?');
    expect(byId.intent).toBe('person-risk');
  });

  it('answers impact questions with the blast radius', () => {
    const result = answerQuery(sampleGraph, 'What breaks if Alex Rivera leaves?');
    expect(result.understood).toBe(true);
    expect(result.intent).toBe('person-impact');
    expect(result.answer).toContain('If Alex Rivera becomes unavailable');
    expect(result.answer).toMatch(/page\(s\) where they are the only recorded contributor/);
  });

  it('answers epic-lineage questions by key or title', () => {
    const byKey = answerQuery(sampleGraph, 'Trace the epic PAY-1');
    expect(byKey.understood).toBe(true);
    expect(byKey.intent).toBe('epic-lineage');
    expect(byKey.answer).toContain('PAY-1');
    expect(byKey.answer).toContain('Payments reliability');

    const byTitle = answerQuery(sampleGraph, 'Show me the lineage of Payments reliability');
    expect(byTitle.intent).toBe('epic-lineage');
  });

  it('answers decision-trace questions', () => {
    const result = answerQuery(sampleGraph, 'What is the status of the idempotency decision?');
    expect(result.understood).toBe(true);
    expect(result.intent).toBe('decision-trace');
    expect(result.answer).toContain('Decision: idempotency key scope');
    expect(result.answer).toContain('proposed');
  });

  it('answers epic-impact questions by key or title, and project-level risk questions', () => {
    const byTitle = answerQuery(sampleGraph, 'What breaks if the Payments reliability epic changes?');
    expect(byTitle.understood).toBe(true);
    expect(byTitle.intent).toBe('epic-impact');
    expect(byTitle.answer).toContain('If Payments reliability (PAY-1) changes');
    expect(byTitle.answer).toMatch(/4 open issue\(s\) that lose their recorded plan/);
    expect(byTitle.answer).toContain('Alex Rivera');
    expect(byTitle.evidence.length).toBeGreaterThan(0);
    expect(byTitle.caveats.length).toBeGreaterThan(0);

    // "top risks for project X" is the same blast radius, answered at epic level.
    const projectRisks = answerQuery(sampleGraph, 'What are the top knowledge-continuity risks in the Payments reliability epic?');
    expect(projectRisks.understood).toBe(true);
    expect(projectRisks.intent).toBe('epic-impact');
    expect(projectRisks.answer).toContain('recorded gap(s)');
  });

  it('answers decision-impact questions with the blast radius of the decision', () => {
    const result = answerQuery(sampleGraph, 'What happens if the idempotency key scope decision changes?');
    expect(result.understood).toBe(true);
    expect(result.intent).toBe('decision-impact');
    expect(result.answer).toContain('"Decision: idempotency key scope" is currently proposed');
    expect(result.answer).toMatch(/1 open issue\(s\) that must be reviewed/);
    expect(result.answer).toContain('Alex Rivera');
    expect(result.evidence.length).toBeGreaterThan(0);

    // Status questions without impact words still trace the decision.
    const status = answerQuery(sampleGraph, 'What is the status of the token format decision?');
    expect(status.intent).toBe('decision-trace');
  });

  it('answers overview questions with the counts', () => {
    const result = answerQuery(sampleGraph, 'Give me an overview of the organization');
    expect(result.understood).toBe(true);
    expect(result.intent).toBe('overview');
    expect(result.answer).toContain('3 people');
    expect(result.answer).toContain('3 epics');
  });

  it('never returns empty evidence for an understood answer', () => {
    for (const q of ANSWERABLE_QUESTIONS) {
      const result = answerQuery(sampleGraph, q.example);
      expect(result.understood, q.example).toBe(true);
      expect(result.evidence.length, q.example).toBeGreaterThan(0);
      expect(result.caveats.length, q.example).toBeGreaterThan(0);
    }
  });
});

describe('answerQuery — honest failure modes', () => {
  it('says when it cannot map a question, and lists what it can answer', () => {
    const result = answerQuery(sampleGraph, 'what is the weather on mars?');
    expect(result.understood).toBe(false);
    expect(result.evidence).toEqual([]);
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions).toHaveLength(ANSWERABLE_QUESTIONS.length);
    expect(result.answer).toContain('could not map');
  });

  it('treats an unknown capitalized mention as a person question it cannot answer', () => {
    // 'Mars' looks like a name but matches nobody: the engine says so instead
    // of silently answering a ranking or overview the user did not ask for.
    const result = answerQuery(sampleGraph, 'What is the weather on Mars?');
    expect(result.understood).toBe(false);
    expect(result.answer).toContain("No person matching 'Mars'");
    expect(result.suggestions).toBeDefined();
  });

  it('asks for disambiguation when a first name means two people', () => {
    const graph: OrgGraph = {
      ...sampleGraph,
      people: [...sampleGraph.people, { id: 'sam2', name: 'Samir Gupta' }],
    };
    const result = answerQuery(graph, 'What is the risk around Sam?');
    expect(result.understood).toBe(false);
    expect(result.answer).toContain('Sam Chen');
    expect(result.answer).toContain('Samir Gupta');
  });

  it('says when a mentioned person does not exist, instead of answering something else', () => {
    const result = answerQuery(sampleGraph, 'What is the risk around Zed?');
    expect(result.understood).toBe(false);
    expect(result.answer).toContain("No person matching 'Zed'");
    expect(result.answer).toContain('Alex Rivera');
  });

  it('handles an empty graph without crashing', () => {
    const empty: OrgGraph = { people: [], workItems: [], pages: [], pullRequests: [], decisions: [] };
    const overview = answerQuery(empty, 'Give me an overview');
    expect(overview.understood).toBe(true);
    expect(overview.answer).toContain('0 people');
    const person = answerQuery(empty, 'What is the risk around Alex?');
    expect(person.understood).toBe(false);
    expect(person.answer).toContain('no people');
  });

  it('refuses an impact question that names no epic or decision, instead of guessing one', () => {
    const result = answerQuery(sampleGraph, 'What breaks if the epic changes?');
    expect(result.understood).toBe(false);
    expect(result.answer).toContain('could not map');
    expect(result.suggestions).toHaveLength(ANSWERABLE_QUESTIONS.length);
    expect(result.suggestions).toContain('What breaks if the Payments reliability epic changes?');
  });
});

describe('answerQuery — session 9: commands, synonyms, did-you-mean', () => {
  it('refuses scheduling and messaging commands instead of answering a risk profile', () => {
    for (const q of [
      'can you schedule a 1:1 with alex?',
      'book a meeting with priya nair',
      'please ping sam chen about the handover',
      'can you message alex?',
      'send an email to priya about the offsite',
    ]) {
      const result = answerQuery(sampleGraph, q);
      expect(result.understood, q).toBe(false);
      expect(result.evidence, q).toEqual([]);
      expect(result.answer, q).toContain('looks like a request');
      expect(result.suggestions, q).toHaveLength(ANSWERABLE_QUESTIONS.length);
    }
  });

  it('does not over-fire the command guard on legitimate questions', () => {
    // "send me the top risks" is a ranking request, not a message request.
    expect(answerQuery(sampleGraph, 'send me the top risks').intent).toBe('top-risks');
    expect(answerQuery(sampleGraph, 'send me the top risks').understood).toBe(true);
    expect(answerQuery(sampleGraph, 'can you tell me about alex?').intent).toBe('person-risk');
    expect(answerQuery(sampleGraph, 'what is the release schedule?').understood).toBe(false);
  });

  it('answers the closed synonym gaps with the right intent and entity', () => {
    expect(answerQuery(sampleGraph, 'what are the consequences of priya leaving?').intent).toBe('person-impact');
    expect(answerQuery(sampleGraph, 'who is the bottleneck on the payments epic?').intent).toBe('epic-impact');
    expect(answerQuery(sampleGraph, 'who is our single point of failure?').intent).toBe('top-risks');
    expect(answerQuery(sampleGraph, 'who is irreplaceable here?').intent).toBe('top-risks');
    expect(answerQuery(sampleGraph, 'who holds the most institutional knowledge?').intent).toBe('top-risks');
    expect(answerQuery(sampleGraph, 'do we have a succession plan?').intent).toBe('top-risks');
    // A SPOF question naming one person is that person's profile.
    const priya = answerQuery(sampleGraph, 'is priya a single point of failure?');
    expect(priya.intent).toBe('person-risk');
    expect((priya.data as { personId: string }).personId).toBe('priya');
  });

  it('treats a capitalized risk phrase as emphasis, not an unknown person', () => {
    const result = answerQuery(sampleGraph, 'Who is our Single Point of Failure?');
    expect(result.understood).toBe(true);
    expect(result.intent).toBe('top-risks');
  });

  it('refuses plural-epic ranking questions instead of guessing the people ranking', () => {
    const result = answerQuery(sampleGraph, 'which epics are most at risk right now?');
    expect(result.understood).toBe(false);
    expect(result.answer).toContain('could not map');
  });

  it('ranks did-you-mean suggestions: impact wording surfaces the impact example first', () => {
    const result = answerQuery(sampleGraph, 'What breaks if the epic changes?');
    expect(result.understood).toBe(false);
    expect(result.suggestions?.[0]).toBe('What breaks if the Payments reliability epic changes?');
  });

  it('ranks did-you-mean suggestions: an unknown person surfaces the person questions first', () => {
    const result = answerQuery(sampleGraph, 'What is the risk around Zed?');
    expect(result.understood).toBe(false);
    expect(result.suggestions?.[0]).toBe('What is the risk around Alex Rivera?');
  });

  it('keeps suggestions deterministic: the same miss suggests the same order', () => {
    const a = answerQuery(sampleGraph, 'what breaks if the epic changes?');
    const b = answerQuery(sampleGraph, 'what breaks if the epic changes?');
    expect(a.suggestions).toEqual(b.suggestions);
  });

  it('returns byte-identical answers on repeated calls (cache-transparent determinism)', () => {
    for (const q of [
      'What are the biggest knowledge risks right now?',
      'What is the risk around Alex Rivera?',
      'What breaks if Alex leaves?',
      'Give me an overview of the organization',
    ]) {
      expect(JSON.stringify(answerQuery(sampleGraph, q)), q).toBe(JSON.stringify(answerQuery(sampleGraph, q)));
    }
  });
});
