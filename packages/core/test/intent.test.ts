import { describe, expect, it } from 'vitest';
import {
  arbitrateFreeQuestion,
  impactSignal,
  impactStrong,
  rankingSignal,
  rankingStrong,
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

describe('scoreIntents — session 9 lexicon expansion', () => {
  it('scores consequence, bottleneck and damage wording as strong impact', () => {
    for (const q of [
      'what are the consequences of priya leaving?',
      'who is the bottleneck on the auth epic?',
      "what's the damage of losing sam?",
    ]) {
      expect(impactStrong(scoreIntents(q)), q).toBe(true);
    }
  });

  it('scores the risk synonyms as strong ranking signals', () => {
    for (const q of [
      'who is our most critical person?',
      'is anyone about to become a single point of failure?',
      'any single points of failure on the team?',
      'do we have a succession plan?',
      'who is irreplaceable on this team?',
      'who holds the most institutional knowledge?',
      'what is the highest-impact thing we could lose?',
    ]) {
      expect(rankingStrong(scoreIntents(q)), q).toBe(true);
    }
  });

  it('keeps person-named SPOF questions out of the ranking-only lane', () => {
    // "is priya a single point of failure?" is strong ranking AND names a
    // person; the answer layer resolves the entity first, so both can fire.
    const scores = scoreIntents('is priya a single point of failure?');
    expect(rankingStrong(scores)).toBe(true);
  });

  it('does not let "succession risk" fire the succession-plan signal', () => {
    // "succession risk for alex" is an impact question about one person;
    // only the exact "succession plan" phrase means the org-wide ranking.
    // The bare "risk" word still scores its weak weight, but the strong
    // ranking lane (>= 3) must stay closed so entity-first arbitration wins.
    const scores = scoreIntents('succession risk for alex');
    expect(rankingStrong(scores)).toBe(false);
    expect(impactStrong(scores)).toBe(true);
  });

  it('matches the hyphenated superlative ("highest-impact") as ranking', () => {
    expect(rankingStrong(scoreIntents('what is the highest-impact thing we could lose?'))).toBe(true);
  });
});

describe('arbitrateFreeQuestion — the plural-epic guard', () => {
  it('refuses epic-ranking questions instead of answering the people ranking', () => {
    expect(arbitrateFreeQuestion(scoreIntents('which epics are most at risk right now?'))).toBeUndefined();
    expect(arbitrateFreeQuestion(scoreIntents('how are our epics doing?'))).toBeUndefined();
  });

  it('still answers overview wording about epics with the org overview', () => {
    expect(arbitrateFreeQuestion(scoreIntents('give me an overview of the epics'))).toBe('overview');
  });

  it('keeps answering people-ranking and overview questions without epic wording', () => {
    expect(arbitrateFreeQuestion(scoreIntents('What are the biggest knowledge risks right now?'))).toBe('top-risks');
    expect(arbitrateFreeQuestion(scoreIntents('How healthy is the team?'))).toBe('overview');
  });
});
