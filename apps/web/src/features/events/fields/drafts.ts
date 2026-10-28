import type {
  DiaperEvent,
  Event,
  FeedingData,
  MedicationEvent,
  PumpingEvent,
} from '@lullabo/shared'

import { inputValue } from '../../../lib/units'
import { m } from '../../../paraglide/messages.js'
import { type BottleInput, parseBottle } from './bottle-input'
import {
  type GrowthDraft,
  type GrowthErrors,
  draftFromGrowth,
  emptyGrowth,
  parseGrowth,
} from './growth-input'
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

/** Every record type's field values, as a form holds them; only the record's own are used. */
export interface RecordDrafts {
  bottle: BottleDraft
  food: string
  pumping: PumpingDraft
  celsius: string
  medication: MedicationDraft
  growth: GrowthDraft
  diaper: DiaperEvent['data']
}

export const emptyDrafts: RecordDrafts = {
  bottle: emptyBottle,
  food: '',
  pumping: emptyPumping,
  celsius: '',
  medication: emptyMedication,
  growth: emptyGrowth,
  diaper: { contents: 'wet' },
}

export type DraftErrors = Partial<Record<'amount' | 'food' | 'celsius' | 'name', string>> &
  GrowthErrors

/** The drafts filled from a stored record, for editing it. */
export function draftsFrom(event: Event): RecordDrafts {
  switch (event.type) {
    case 'feeding':
      if (event.data.kind === 'bottle')
        return { ...emptyDrafts, bottle: draftFromBottle(event.data) }
      if (event.data.kind === 'solids') return { ...emptyDrafts, food: event.data.food }
      return emptyDrafts
    case 'pumping':
      return { ...emptyDrafts, pumping: draftFromPumping(event.data) }
    case 'temperature':
      return { ...emptyDrafts, celsius: inputValue('temperature', event.data.celsius) }
    case 'medication':
      return { ...emptyDrafts, medication: draftFromMedication(event.data) }
    case 'growth':
      return { ...emptyDrafts, growth: draftFromGrowth(event.data) }
    case 'diaper':
      return { ...emptyDrafts, diaper: event.data }
    default:
      return emptyDrafts
  }
}

/**
 * The edited record with the draft of its type as its data, or the draft's field errors. A
 * mixed bottle logged before the split existed keeps its total, and a running pumping may not
 * have an amount yet.
 */
export function withDrafts(
  event: Event,
  drafts: RecordDrafts,
): { event: Event } | { errors: DraftErrors } {
  const result = <D>(
    parsed: Parsed<D, string> | { errors: DraftErrors },
    apply: (data: D) => Event,
  ) => ('errors' in parsed ? { errors: parsed.errors } : { event: apply(parsed.data) })
  switch (event.type) {
    case 'feeding':
      if (event.data.kind === 'bottle') {
        return result(parseBottleDraft(drafts.bottle, true), (data) => ({ ...event, data }))
      }
      if (event.data.kind === 'solids') {
        return result(parseSolids(drafts.food), (data) => ({ ...event, data }))
      }
      return { event }
    case 'diaper':
      return { event: { ...event, data: drafts.diaper } }
    case 'pumping':
      if (event.endAt === null && !drafts.pumping.amount.trim()) {
        return { event: { ...event, data: { side: drafts.pumping.side } } }
      }
      return result(parsePumping(drafts.pumping), (data) => ({ ...event, data }))
    case 'temperature':
      return result(parseCelsius(drafts.celsius), (data) => ({ ...event, data }))
    case 'medication':
      return result(parseMedication(drafts.medication), (data) => ({ ...event, data }))
    case 'growth':
      return result(parseGrowth(drafts.growth), (data) => ({ ...event, data }))
    default:
      return { event }
  }
}
