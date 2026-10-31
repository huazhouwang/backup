import { m } from '../paraglide/messages.js'
import { type Locale, getLocale } from './i18n'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "5 minutes ago", "yesterday", in the active locale unless one is given. */
export function timeAgo(time: number, now: number, locale: Locale = getLocale()): string {
  const elapsed = now - time
  const options = { locale }
  if (elapsed < 45_000) return m.timeJustNow({}, options)
  const count = (size: number) => Math.max(1, Math.round(elapsed / size))
  if (elapsed >= DAY) {
    const days = count(DAY)
    return days === 1 ? m.timeYesterday({}, options) : m.timeDaysAgo({ count: days }, options)
  }
  if (elapsed >= HOUR) return m.timeHoursAgo({ count: count(HOUR) }, options)
  return m.timeMinutesAgo({ count: count(MINUTE) }, options)
}
