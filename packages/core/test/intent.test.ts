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

describe('scoreIntents — session 10 lexicon and wording expansion', () => {
  it('scores the new risk synonyms as strong ranking', () => {
    for (const q of [
      'who is our weakest link?',
      'who is our most dangerous liability?',
      "who's carrying the most context these days?",
    ]) {
      expect(rankingStrong(scoreIntents(q)), q).toBe(true);
    }
  });

  it('keeps the carrying-context phrase tight', () => {
    // "who has the most context on the payments system?" names a topic the
    // records cannot rank — no ranking signal may fire on the has-form.
    expect(rankingSignal(scoreIntents('who has the most context on the payments system?'))).toBe(false);
    // And any other "carrying" question is not the load phrasing.
    expect(rankingSignal(scoreIntents('who is carrying the team?'))).toBe(false);
  });

  it('scores availability wording inside the if-lane as strong impact', () => {
    for (const q of [
      'how exposed are we if sam is out sick?',
      'what breaks if sam is on leave?',
      'who is exposed if alex calls in sick?',
    ]) {
      expect(impactStrong(scoreIntents(q)), q).toBe(true);
    }
  });

  it('does not fire impact on bare availability statements', () => {
    // No if-clause: "sam is out sick today" is a statement, not a question.
    expect(impactSignal(scoreIntents('sam is out sick today'))).toBe(false);
  });

  it('scores "lost" as impact wording', () => {
    expect(impactStrong(scoreIntents('what if we lost alex tomorrow?'))).toBe(true);
  });

  it('scores coverage questions as overview', () => {
    for (const q of ['what is our knowledge coverage?', 'how is our knowledge coverage?']) {
      expect(scoreIntents(q).overview, q).toBeGreaterThanOrEqual(2);
    }
  });

  it('scores decide-verb phrasings as decision-domain', () => {
    for (const q of [
      'what did we decide on retries?',
      'who made the call on the token format?',
      'why did we move away from the queue approach?',
    ]) {
      expect(scoreIntents(q).decision, q).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('scoreIntents and arbitration — session 11 lexicon and wording expansion', () => {
  it('scores the new ranking synonyms as strong ranking', () => {
    for (const q of [
      'who is our linchpin?',
      'who are our key persons?',
      'who is our most indispensable engineer?',
      'who are the guardians of our tribal knowledge?',
      'who is spread the thinnest across epics?',
      'who do we never want to lose?',
    ]) {
      expect(rankingStrong(scoreIntents(q)), q).toBe(true);
    }
  });

  it('keeps the new phrases tight', () => {
    // The lose idiom carries "never"; "key" is only a ranking word with
    // persons/people; "thin" needs the spread; a bare who-word is nothing.
    expect(rankingSignal(scoreIntents('who do we want to lose?'))).toBe(false);
    expect(rankingSignal(scoreIntents('who are our key engineers?'))).toBe(false);
    expect(rankingSignal(scoreIntents('who is the thinnest person on the team?'))).toBe(false);
    expect(scoreIntents('who let the dogs out?').who).toBe(1); // who present, nothing else
    expect(scoreIntents('which epics are most at risk right now?').who).toBe(0);
  });

  it('scores fallout as consequence wording (strong impact)', () => {
    expect(impactStrong(scoreIntents('what is the fallout of priya leaving?'))).toBe(true);
    expect(impactStrong(scoreIntents('what is the fallout if sam quits?'))).toBe(true);
  });

  it('scores deprioritize forms as change actions, and only in the if-lane for -ed', () => {
    // Action forms fire anywhere; the 'ed' state fires only inside an if.
    expect(impactSignal(scoreIntents('what if we deprioritize the auth epic?'))).toBe(true);
    expect(impactStrong(scoreIntents('what if the payments epic gets deprioritized?'))).toBe(true);
    expect(impactSignal(scoreIntents('what happens if the auth epic is deprioritized?'))).toBe(true);
    // State, no if-lane: "was deprioritized" alone must not read as a change.
    expect(impactSignal(scoreIntents('the auth epic was deprioritized last quarter'))).toBe(false);
  });

  it('lets a who-question with a strong ranking signal escape the plural-epic guard', () => {
    // "spread thinnest across epics" mentions epics as context; the people
    // ranking is what is being asked for.
    expect(arbitrateFreeQuestion(scoreIntents('who is spread the thinnest across epics?'))).toBe('top-risks');
    // Without a who-subject the guard keeps refusing epic rankings.
    expect(arbitrateFreeQuestion(scoreIntents('which epics are most at risk right now?'))).toBeUndefined();
  });
});

describe('scoreIntents and arbitration — session 13 lexicon, while-lane and bare-leave fix', () => {
  it('scores the new ranking synonyms as strong ranking', () => {
    for (const q of [
      'who would be impossible to replace?',
      'who has the keys to the kingdom?',
      'who are our knowledge hoarders?',
      'who is our secret weapon?',
      'who is the most central person on the team?',
      'who is the institutional memory of the team?',
      'who is the most relied-upon person here?',
      'what is our biggest vulnerability as a team?',
      'who would have the biggest shoes to fill?',
      'who would the team struggle without the most?',
      'who is our weak spot?',
      'who is the most load-bearing person on the team?',
      'who is carrying an unreasonable load?',
      'who is the one we cannot lose?',
      'who is our lynchpin?',
    ]) {
      expect(rankingStrong(scoreIntents(q)), q).toBe(true);
    }
  });

  it('keeps the new phrases tight', () => {
    // The kingdom needs its keys' destination; struggle needs the without;
    // the replace family stays one-sided; the vulnerability family is
    // superlative-tight; "most replaceable" asks the opposite ranking.
    expect(rankingSignal(scoreIntents('who has the keys?'))).toBe(false);
    expect(rankingSignal(scoreIntents('who struggles the most?'))).toBe(false);
    expect(rankingSignal(scoreIntents('who is impossible?'))).toBe(false);
    expect(rankingSignal(scoreIntents('who is the most replaceable person on the team?'))).toBe(false);
    expect(rankingSignal(scoreIntents('do we have any vulnerability?'))).toBe(false);
  });

  it('scores the while-lane with a person as strong impact, and only with a be-verb', () => {
    expect(impactStrong(scoreIntents('who is exposed while alex is on vacation?'))).toBe(true);
    expect(impactStrong(scoreIntents('who covers the payments work while sam is on leave?'))).toBe(true);
    expect(impactStrong(scoreIntents('who is exposed while priya is out of office?'))).toBe(true);
    // Past tense is a historical fact, not a hypothetical; a bare fragment
    // has no be-verb.
    expect(impactSignal(scoreIntents('while alex was on vacation we shipped the payments work'))).toBe(false);
    expect(impactSignal(scoreIntents('what can alex do while on vacation?'))).toBe(false);
  });

  it('scores ripple effects as consequence wording beside consequences and fallout', () => {
    expect(impactStrong(scoreIntents('what are the ripple effects of the queue decision?'))).toBe(true);
    expect(impactStrong(scoreIntents('what are the ripple effects of losing sam?'))).toBe(true);
  });

  it('scores the new availability wording inside the if-lane as strong impact', () => {
    for (const q of [
      'what if priya goes on parental leave?',
      'what if priya takes maternity leave?',
      'what if sam takes paternity leave?',
      'what if priya takes a sabbatical?',
      'what if alex gets poached?',
      'what if alex gets sick?',
      'what if alex falls ill?',
      'what if alex is away next month?',
      'who is exposed if alex goes on sabbatical?',
    ]) {
      expect(impactStrong(scoreIntents(q)), q).toBe(true);
    }
  });

  it('does not fire the departure lane on the noun "leave" (bare-leave fix)', () => {
    // The session-12 any-subject extension let the lazy filler read the
    // noun "leave" as the departure verb; the scheduling shapes must not
    // score impact.
    for (const q of [
      'when does priya go on parental leave?',
      'when is alex on leave?',
      'when will sam be back from leave?',
    ]) {
      expect(impactSignal(scoreIntents(q)), q).toBe(false);
    }
    // The genuine departure shapes still fire.
    expect(impactStrong(scoreIntents('should we reassign tickets before priya leaves?'))).toBe(true);
    expect(impactStrong(scoreIntents('what breaks when priya goes on sabbatical?'))).toBe(true);
  });

  it('scores rely-on as dependence wording, like depend-on', () => {
    expect(impactSignal(scoreIntents('who relies on priya?'))).toBe(true);
    expect(impactSignal(scoreIntents('who do we rely on the most?'))).toBe(true);
    expect(impactSignal(scoreIntents('who does everyone rely on for the runbook?'))).toBe(true);
  });
});
