import type { FeedingData, MedicationEvent, PumpingEvent } from '@lullabo/shared'

import { inputValue } from '../../lib/units'
import { m } from '../../paraglide/messages.js'
import { type BottleInput, parseBottle } from './bottle-input'
import { parseTemperature, parseVolume } from './measure-input'

/**
 * Field values of each record type as typed (strings in display units), shared by the logging
 * and editing forms. `draftFrom*` fills a draft from a stored record; `parse*` validates one
 * into record data or per-field errors.
 */
export type Parsed<D, F extends string> = { data: D } | { errors: Partial<Record<F, string>> }

type BottleData = Extract<FeedingData, { kind: 'bottle' }>
export type BottleDraft = BottleInput
export const emptyBottle: BottleDraft = { milk: 'formula', amount: '', breast: '', formula: '' }

export function draftFromBottle(data: BottleData): BottleDraft {
  return {
    milk: data.milk,
    amount: inputValue('volume', data.amountMl),
    breast: data.breastMl === undefined ? '' : inputValue('volume', data.breastMl),
    formula: data.formulaMl === undefined ? '' : inputValue('volume', data.formulaMl),
  }
}

/**
 * Whether a mixed bottle is entered as its two parts. With `keepTotal` (editing), a mixed bottle
 * logged before the split existed keeps its total until parts are entered.
 */
export const showsMixedParts = (draft: BottleDraft, keepTotal = false) =>
  draft.milk === 'mixed' && (!keepTotal || Boolean(draft.breast || draft.formula || !draft.amount))

export function parseBottleDraft(
  draft: BottleDraft,
  keepTotal = false,
): Parsed<BottleData, 'amount'> {
  const bottle = showsMixedParts(draft, keepTotal)
    ? parseBottle(draft)
    : parseBottle({ ...draft, milk: draft.milk === 'mixed' ? 'formula' : draft.milk })
  if ('error' in bottle) return { errors: { amount: bottle.error } }
  return { data: { kind: 'bottle', amountMl: bottle.amountMl, milk: draft.milk, ...bottle.split } }
}

export function parseSolids(
  food: string,
): Parsed<Extract<FeedingData, { kind: 'solids' }>, 'food'> {
  return food.trim()
    ? { data: { kind: 'solids', food: food.trim() } }
    : { errors: { food: m.solidsFoodRequired() } }
}

export interface PumpingDraft {
  side: PumpingEvent['data']['side']
  amount: string
}
export const emptyPumping: PumpingDraft = { side: 'both', amount: '' }

export const draftFromPumping = (data: PumpingEvent['data']): PumpingDraft => ({
  side: data.side,
  amount: data.amountMl === undefined ? '' : inputValue('volume', data.amountMl),
})

export function parsePumping(
  draft: PumpingDraft,
): Parsed<PumpingEvent['data'] & { amountMl: number }, 'amount'> {
  const volume = parseVolume(draft.amount)
  return 'error' in volume
    ? { errors: { amount: volume.error } }
    : { data: { side: draft.side, amountMl: volume.amountMl } }
}

export function parseCelsius(celsius: string): Parsed<{ celsius: number }, 'celsius'> {
  const temperature = parseTemperature(celsius)
  return 'error' in temperature
    ? { errors: { celsius: temperature.error } }
    : { data: { celsius: temperature.celsius } }
}

export interface MedicationDraft {
  name: string
  dose: string
}
export const emptyMedication: MedicationDraft = { name: '', dose: '' }

export const draftFromMedication = (data: MedicationEvent['data']): MedicationDraft => ({
  name: data.name,
  dose: data.dose ?? '',
})

export function parseMedication(draft: MedicationDraft): Parsed<MedicationEvent['data'], 'name'> {
  return draft.name.trim()
    ? { data: { name: draft.name.trim(), dose: draft.dose.trim() || null } }
    : { errors: { name: m.medicationNameRequired() } }
}
