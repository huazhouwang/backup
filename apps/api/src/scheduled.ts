import { deleteOldConversations } from './agent/retention'
import type { Env } from './env'
import { dispatchReminders } from './reminders'
import { dispatchVaccineReminders } from './vaccine-reminders'

/**
 * The cron's work (wrangler.jsonc, every minute): due reminders, each quarter hour the
 * vaccination reminders of devices where it is 9:00, and on the hour, deleting
 * conversations older than 30 days. Each job runs on its own, so one failing never stops the
 * other.
 */
export async function runScheduled(env: Env, now: number, fetcher?: typeof fetch) {
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ['reminders', () => dispatchReminders(env, now, fetcher)],
  ]
  // At 9:00 somewhere: zones are whole hours, or half or three quarters past.
  if (new Date(now).getUTCMinutes() % 15 === 0) {
    jobs.push(['vaccines', () => dispatchVaccineReminders(env, now, fetcher)])
  }
  if (new Date(now).getUTCMinutes() === 0) {
    jobs.push(['retention', () => deleteOldConversations(env.DB, now)])
  }
  const results = await Promise.allSettled(jobs.map(([, job]) => job()))
  results.forEach((result, index) => {
    if (result.status === 'rejected')
      console.error(`Cron job ${jobs[index]?.[0]} failed`, result.reason)
  })
  return results
}
