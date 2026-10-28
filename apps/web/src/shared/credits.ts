/** Free credits (issue 185): what a model call costs and what a user has left. Pure, shared by the Worker and the tests. */

export interface CreditSettings {
  /** A guest's one-off allowance and a signed-in user's monthly one (credits) */
  guest: number;
  user: number;
  /** Credits per million input / output tokens */
  priceInput: number;
  priceOutput: number;
  /** Credits everyone together may spend on the platform's model in a day */
  dailyCap: number;
}

/** What a call cost, rounded up so even a tiny call counts */
export const creditsFor = (input: number, output: number, s: CreditSettings) => Math.ceil((input * s.priceInput + output * s.priceOutput) / 1e6);

/** Start of the period an allowance covers: a guest's is all time (once), a user's the calendar month (UTC) */
export function periodStart(guest: boolean, at = Date.now()) {
  if (guest) return 0;
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Start of today (UTC), for the daily cap */
export function dayStart(at = Date.now()) {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface CreditState {
  available: boolean;
  guest: boolean;
  allowance: number;
  spent: number;
  balance: number;
  /** When the allowance refills (ms), or null for a guest's one-off */
  resetsAt: number | null;
}

/** A user's credits, from what they spent this period */
export function creditState(guest: boolean, spent: number, s: CreditSettings, available: boolean, at = Date.now()): CreditState {
  const allowance = guest ? s.guest : s.user;
  const d = new Date(at);
  return {
    available,
    guest,
    allowance,
    spent,
    balance: Math.max(0, allowance - spent),
    resetsAt: guest ? null : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
  };
}
