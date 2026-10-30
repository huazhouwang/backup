import type {
  BookletDose,
  CustomVaccine,
  VaccineChoices,
  VaccinePlanSettings,
} from '@lullabo/shared'

/**
 * The plan as saved: every part present, so the server knows an empty one was emptied, not
 * left out by an older app (sync/sql.ts keeps those).
 */
export const savedPlan = (plan: VaccineChoices): VaccinePlanSettings => ({
  region: plan.region,
  picked: { ...plan.picked },
  selfPaid: [...plan.selfPaid],
  appointments: { ...plan.appointments },
  custom: structuredClone([...(plan.custom ?? [])]),
})

/** A dose booked for `day`, or back on the schedule's day with null. */
export function withAppointment(plan: VaccineChoices, key: string, day: string | null) {
  const { [key]: _old, ...rest } = plan.appointments ?? {}
  return { ...plan, appointments: day ? { ...rest, [key]: day } : rest }
}

const newId = () => `custom-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`

/** A vaccine of the family's own, its doses on `days` (one per dose), and its id. */
export function withCustom(plan: VaccineChoices, name: string, days: readonly string[]) {
  const id = newId()
  const custom: CustomVaccine = { id, name: name.trim(), doses: days.length }
  const appointments = { ...plan.appointments }
  days.forEach((day, index) => {
    appointments[`${id}:${index + 1}`] = day
  })
  return { plan: { ...plan, custom: [...(plan.custom ?? []), custom], appointments }, id }
}

/** The plan without one of the family's vaccines; doses given stay on record. */
export function withoutCustom(plan: VaccineChoices, id: string): VaccineChoices {
  const appointments = Object.fromEntries(
    Object.entries(plan.appointments ?? {}).filter(([key]) => !key.startsWith(`${id}:`)),
  )
  return {
    ...plan,
    custom: (plan.custom ?? []).filter((vaccine) => vaccine.id !== id),
    appointments,
  }
}

export interface DoseToRecord {
  vaccineId: string
  /** For a vaccine no schedule knows. */
  name?: string
  dose: number
  day: string
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * What saving doses read off a booklet does: the doses to record, those already on record
 * left out, and the plan with a vaccine of the family's own for each one no schedule knows,
 * named as the booklet writes it (one already added by that name is reused, and grows to
 * the doses read).
 */
export function importDoses(
  plan: VaccineChoices,
  doses: readonly BookletDose[],
  given: ReadonlySet<string>,
): { plan: VaccineChoices; records: DoseToRecord[] } {
  const custom: CustomVaccine[] = structuredClone([...(plan.custom ?? [])])
  const records: DoseToRecord[] = []
  const recorded = new Set(given)
  for (const dose of doses) {
    let vaccineId = dose.vaccineId
    let name: string | undefined
    if (!vaccineId) {
      name = dose.name.trim()
      let own = custom.find((vaccine) => sameName(vaccine.name, dose.name))
      if (!own) {
        own = { id: newId(), name, doses: dose.dose }
        custom.push(own)
      }
      own.doses = Math.max(own.doses, dose.dose)
      vaccineId = own.id
    }
    const key = `${vaccineId}:${dose.dose}`
    if (recorded.has(key)) continue
    recorded.add(key)
    records.push({ vaccineId, ...(name ? { name } : {}), dose: dose.dose, day: dose.date })
  }
  const changed = JSON.stringify(custom) !== JSON.stringify(plan.custom ?? [])
  return { plan: changed ? { ...plan, custom } : plan, records }
}
