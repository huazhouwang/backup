import { m } from '../../paraglide/messages.js'

/**
 * Human duration such as "1 小时 20 分钟" or "45 分钟"; `short` for tight spots, such as
 * "1小时20分" on a button.
 */
export function durationLabel(ms: number, { short = false } = {}): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (ms > 0 && totalMinutes === 0) return m.durationUnderMinute()
  if (hours === 0) return m.durationMinutes({ minutes })
  if (minutes === 0) return m.durationHours({ hours })
  return short
    ? m.durationHoursMinutesShort({ hours, minutes })
    : m.durationHoursMinutes({ hours, minutes })
}
