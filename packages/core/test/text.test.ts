import { describe, expect, it } from 'vitest';
import {
  bestTokenScore,
  editDistance,
  initialsOf,
  normalize,
  tokenMatches,
  tokenSimilarity,
  tokens,
  typoBudget,
} from '../src/text.js';

describe('normalize / tokens', () => {
  it('normalizes case and whitespace', () => {
    expect(normalize('  Alex   Rivera ')).toBe('alex rivera');
  });

  it('splits content tokens and drops stop words', () => {
    expect(tokens('What is the risk around Alex?')).toEqual(['risk', 'around', 'alex']);
  });

  it('keeps dash-splitting to the caller (record ids survive rawWords, not tokens)', () => {
    // 'pay-1' splits into 'pay' and '1'; the '1' is dropped (single char).
    // Dash-preserving id matching lives in matcher.ts rawWords.
    expect(tokens('trace pay-1')).toEqual(['trace', 'pay']);
  });

  it('derives initials from content tokens', () => {
    expect(initialsOf('Alex R. Rivera')).toBe('ar');
  });
});

describe('editDistance (Damerau-Levenshtein, optimal string alignment)', () => {
  it('is zero for equal strings', () => {
    expect(editDistance('rivera', 'rivera')).toBe(0);
  });

  it('counts substitutions', () => {
    expect(editDistance('cat', 'cap')).toBe(1);
  });

  it('counts a transposition as one edit', () => {
    expect(editDistance('rivear', 'rivera')).toBe(1);
    expect(editDistance('ab', 'ba')).toBe(1);
  });

  it('counts insertions and deletions', () => {
    expect(editDistance('alex', 'alexs')).toBe(1);
    expect(editDistance('alexs', 'alex')).toBe(1);
  });

  it('bounds the search and reports max+1 when clearly beyond it', () => {
    expect(editDistance('alex', 'priya', 1)).toBe(2);
    expect(editDistance('payments', 'onboarding', 2)).toBe(3);
  });

  it('handles empty operands', () => {
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
    expect(editDistance('', '')).toBe(0);
  });
});

describe('typoBudget and tokenMatches', () => {
  it('grows with token length', () => {
    expect(typoBudget('sam')).toBe(0);
    expect(typoBudget('rivera')).toBe(1);
    expect(typoBudget('reliability')).toBe(2);
    expect(typoBudget('idempotencykey')).toBe(3);
  });

  it('accepts exact and in-budget tokens, rejects the rest', () => {
    expect(tokenMatches('rivera', 'rivera')).toBe(true);
    expect(tokenMatches('riveria', 'rivera')).toBe(true); // 1 edit, budget 1
    expect(tokenMatches('sam', 'sat')).toBe(false); // 3-char tokens get no budget
    expect(tokenMatches('alex', 'priya')).toBe(false);
  });
});

describe('tokenSimilarity (set overlap)', () => {
  it('is 1 for reordered token sets', () => {
    expect(tokenSimilarity('idempotency key scope', 'scope idempotency key')).toBe(1);
  });

  it('is 0 for disjoint sets', () => {
    expect(tokenSimilarity('payments reliability', 'auth hardening')).toBe(0);
  });

  it('is fractional for partial overlap', () => {
    // intersection {payments}, union {payments, reliability, retry, design}
    const score = tokenSimilarity('payments retry design', 'payments reliability');
    expect(score).toBeCloseTo(1 / 4);
  });

  it('is 0 for empty input', () => {
    expect(tokenSimilarity('', 'payments')).toBe(0);
    expect(tokenSimilarity('the of', 'payments')).toBe(0);
  });
});

describe('bestTokenScore', () => {
  it('returns 1 on any exact pair', () => {
    expect(bestTokenScore(['show', 'retries'], ['queue', 'retries'])).toBe(1);
  });

  it('decays with the distance spent inside the budget', () => {
    const score = bestTokenScore(['reliablity'], ['reliability']);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('is 0 when nothing is close', () => {
    expect(bestTokenScore(['deploy', 'service'], ['reliability'])).toBe(0);
  });
});
