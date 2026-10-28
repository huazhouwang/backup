import type { GrowthEvent } from '@lullabo/shared'

import { type Quantity, inputValue, parseQuantity, rangeParams } from '../../../lib/units'
import { m } from '../../../paraglide/messages.js'

/** The three measurement fields as typed, in display units; any may be left empty. */
export interface GrowthDraft {
  weight: string
  length: string
  head: string
}
export const emptyGrowth: GrowthDraft = { weight: '', length: '', head: '' }

export type GrowthErrors = Partial<Record<'weight' | 'length' | 'head' | 'form', string>>

/** Accepted values in stored units (kilograms and centimeters). */
const RANGES = {
  weight: { quantity: 'weight', min: 0.3, max: 40, message: m.growthWeightInvalid },
  length: { quantity: 'length', min: 20, max: 130, message: m.growthLengthInvalid },
  head: { quantity: 'length', min: 15, max: 60, message: m.growthHeadInvalid },
} as const satisfies Record<
  string,
  { quantity: Quantity; min: number; max: number; message: unknown }
>

/**
 * Parses the three optional measurement fields, entered in display units; at least one must be
 * filled in.
 */
export function parseGrowth(
  input: GrowthDraft,
): { data: GrowthEvent['data'] } | { errors: GrowthErrors } {
  const errors: GrowthErrors = {}
  const read = (field: keyof typeof RANGES): number | null => {
    const raw = input[field].trim()
    if (raw === '') return null
    const range = RANGES[field]
    const value = parseQuantity(range.quantity, raw)
    if (!(value >= range.min && value <= range.max)) {
      errors[field] = range.message(rangeParams(range.quantity, range.min, range.max))
      return null
    }
    return value
  }
  const data = { weightKg: read('weight'), lengthCm: read('length'), headCm: read('head') }
  if (Object.keys(errors).length > 0) return { errors }
  if (data.weightKg === null && data.lengthCm === null && data.headCm === null) {
    return { errors: { form: m.growthRequired() } }
  }
  return { data }
}

/** A stored measurement as an editable value in display units. */
const fieldValue = (quantity: Quantity, value: number | null) =>
  value === null ? '' : inputValue(quantity, value)

export const draftFromGrowth = (data: GrowthEvent['data']): GrowthDraft => ({
  weight: fieldValue('weight', data.weightKg),
  length: fieldValue('length', data.lengthCm),
  head: fieldValue('length', data.headCm),
})
