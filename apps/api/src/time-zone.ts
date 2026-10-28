import { MINUTE } from '@lullabo/shared'

// Clock times are said in the user's own zone; the server works in UTC.

function zoneParts(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** The zone's offset from UTC at `at`, in ms. */
function zoneOffset(at: number, timeZone: string): number {
  const p = zoneParts(at, timeZone)
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000
  )
}

/** "HH:MM" today in the zone, or yesterday if that is still ahead of now. */
export function clockToTime(clock: string, now: number, timeZone: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  const today = zoneParts(now, timeZone)
  const local = Date.UTC(today.year, today.month - 1, today.day, hour, minute)
  const at = local - zoneOffset(now, timeZone)
  // A few minutes of slack for clocks said slightly ahead ("10:30" at 10:28).
  return at > now + 5 * MINUTE ? at - 24 * 60 * MINUTE : at
}

export function formatClock(at: number, timeZone: string): string {
  const p = zoneParts(at, timeZone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Minutes since the zone's midnight, for reading a baby's day on its own clock. */
export function minuteOfDayIn(timeZone: string): (at: number) => number {
  return (at) => {
    const p = zoneParts(at, timeZone)
    return p.hour * 60 + p.minute
  }
}

/** The zone's calendar day at `at`, "YYYY-MM-DD". */
export function localDay(at: number, timeZone: string): string {
  const p = zoneParts(at, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** "2026-10-17 21:05 星期五", for the model to resolve times against. */
export function localNow(now: number, timeZone: string): string {
  const p = zoneParts(now, timeZone)
  const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone, weekday: 'long' }).format(now)
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)} ${weekday}`
}
