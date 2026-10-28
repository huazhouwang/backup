import { describe, expect, it } from 'vitest';
import { creditState, creditsFor, dayStart, periodStart } from './credits';

const S = { guest: 100, user: 500, priceInput: 300, priceOutput: 1500, dailyCap: 20000 };

describe('credits (issue 185)', () => {
  it('prices a call by its tokens, rounding up so every call costs something', () => {
    expect(creditsFor(1_000_000, 0, S)).toBe(300);
    expect(creditsFor(0, 1_000_000, S)).toBe(1500);
    expect(creditsFor(6000, 200, S)).toBe(3); // 1.8 + 0.3 → 3
    expect(creditsFor(1, 0, S)).toBe(1);
  });

  it('gives a guest a one-off allowance and a user a monthly one that refills on the 1st (UTC)', () => {
    const at = Date.UTC(2026, 9, 28, 12);
    expect(periodStart(true, at)).toBe(0);
    expect(periodStart(false, at)).toBe(Date.UTC(2026, 9, 1));
    expect(dayStart(at)).toBe(Date.UTC(2026, 9, 28));
    expect(creditState(true, 40, S, true, at)).toMatchObject({ allowance: 100, balance: 60, resetsAt: null });
    expect(creditState(false, 40, S, true, at)).toMatchObject({ allowance: 500, balance: 460, resetsAt: Date.UTC(2026, 10, 1) });
  });

  it('never goes below zero', () => {
    expect(creditState(true, 250, S, true).balance).toBe(0);
  });
});
