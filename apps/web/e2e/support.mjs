// What the end-to-end tests share: the server address, where screenshots go, checks that report each result and keep going,
// and one-time codes read from the dev server's log
import { mkdirSync, readFileSync } from 'node:fs';
import { expect } from '@playwright/test';

export const BASE = process.env.BASE ?? 'http://localhost:3000';
/** Screenshots for looking at afterwards (not compared) */
export const OUT = process.env.E2E_OUT ?? 'test-results/screens';
mkdirSync(OUT, { recursive: true });

/** Report a result and keep going: a failed check fails the test at the end, like a soft assertion */
export const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  expect.soft(ok, msg).toBeTruthy();
};

/** The dev server's log (without RESEND_API_KEY locally, one-time codes are printed to it) */
export function devLog() {
  if (!process.env.DEV_LOG) throw new Error('DEV_LOG is required: the dev server log file, used to read one-time codes');
  return readFileSync(process.env.DEV_LOG, 'utf8');
}
