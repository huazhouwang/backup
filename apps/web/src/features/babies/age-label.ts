import { babyAge, localDateString } from '@lullabo/shared'

import { m } from '../../paraglide/messages.js'

export function ageLabel(birthDate: string, today: string = localDateString()): string {
  const { totalDays, months, days } = babyAge(birthDate, today)
  if (totalDays <= 0) return m.ageNewborn()
  if (months === 0) return m.ageDays({ days })
  if (days === 0) return m.ageMonths({ months })
  return m.ageMonthsDays({ months, days })
}
