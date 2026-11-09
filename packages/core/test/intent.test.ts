import { describe, expect, it } from 'vitest';
import {
  arbitrateFreeQuestion,
  impactSignal,
  impactStrong,
  rankingSignal,
  scoreIntents,
} from '../src/intent.js';

describe('scoreIntents', () => {
  it('scores blast-radius phrasings as strong impact', () => {
    for (const q of [
      'What breaks if Alex leaves?',
      'What happens if the epic changes?',
      'blast radius for alex',
      'we are offboarding sam',
      'if priya got hit by a bus, what breaks?',
      'what do we lose if sam resigns?',
    ]) {
      expect(impactStrong(scoreIntents(q)), q).toBe(true);
    }
  });

  it('scores state descriptions as non-impact', () => {
    // Past participles describe how things are, not a hypothetical change.
    for (const q of [
      'when was the token format decision superseded?',
      'what is the status of the idempotency decision?',
    ]) {
      expect(impactSignal(scoreIntents(q)), q).toBe(false);
    }
  });

  it('scores ranking phrasings above the threshold', () => {
    for (const q of [
      'What are the biggest knowledge risks right now?',
      'who is most at risk?',
      'what is the bus factor of the team?',
      'list the knowledge risks',
      'who should we worry about?',
    ]) {
      expect(rankingSignal(scoreIntents(q)), q).toBe(true);
    }
  });

  it('does not fire ranking on plain who questions', () => {
    expect(rankingSignal(scoreIntents('who is the ceo?'))).toBe(false);
    expect(rankingSignal(scoreIntents('who let the dogs out?'))).toBe(false);
  });

  it('scores overview phrasings', () => {
    for (const q of [
      'Give me an overview of the organization',
      'summarize the org for me',
      'how are we doing?',
      'show me the big picture',
    ]) {
      expect(scoreIntents(q).overview, q).toBeGreaterThanOrEqual(2);
    }
  });

  it('does not treat every "how do I" question as an overview', () => {
    expect(scoreIntents('how do i deploy the payments service?').overview).toBe(0);
  });
});

describe('arbitrateFreeQuestion', () => {
  it('prefers the ranking on risk questions', () => {
    expect(arbitrateFreeQuestion(scoreIntents('What are the biggest knowledge risks right now?'))).toBe('top-risks');
  });

  it('prefers the ranking on a tie (risk is the product subject)', () => {
    expect(arbitrateFreeQuestion(scoreIntents('summary of the risks'))).toBe('top-risks');
  });

  it('maps overview questions to the overview', () => {
    expect(arbitrateFreeQuestion(scoreIntents('Give me an overview of the organization'))).toBe('overview');
  });

  it('returns undefined for unmappable questions', () => {
    expect(arbitrateFreeQuestion(scoreIntents('what is the weather on mars?'))).toBeUndefined();
    expect(arbitrateFreeQuestion(scoreIntents('how do i deploy the payments service?'))).toBeUndefined();
  });
});
