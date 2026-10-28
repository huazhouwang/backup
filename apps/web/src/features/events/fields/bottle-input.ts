import { parseQuantity, rangeParams } from '../../../lib/units'
import { m } from '../../../paraglide/messages.js'
import { MAX_ML, parseVolume } from './measure-input'

export type Milk = 'breast' | 'formula' | 'mixed'

/** Amounts as entered, in display units. */
export interface BottleInput {
  milk: Milk
  /** Total, used unless the milk is mixed. */
  amount: string
  /** Parts, used when the milk is mixed. */
  breast: string
  formula: string
}

export type ParsedBottle =
  | { amountMl: number; split?: { breastMl: number; formulaMl: number } }
  | { error: string }

const part = (value: string) => (value.trim() === '' ? 0 : parseQuantity('volume', value))

/** Mixed bottles take breast milk and formula separately; the total is their sum. */
export function parseBottle(input: BottleInput): ParsedBottle {
  if (input.milk !== 'mixed') return parseVolume(input.amount)
  const breastMl = part(input.breast)
  const formulaMl = part(input.formula)
  const amountMl = Math.round((breastMl + formulaMl) * 10) / 10
  const valid =
    Number.isFinite(amountMl) &&
    breastMl >= 0 &&
    formulaMl >= 0 &&
    amountMl > 0 &&
    amountMl <= MAX_ML
  return valid
    ? { amountMl, split: { breastMl, formulaMl } }
    : { error: m.mixedInvalid(rangeParams('volume', 0, MAX_ML)) }
}

/** Live total in milliliters shown under the two mixed fields. */
export function mixedTotal(input: Pick<BottleInput, 'breast' | 'formula'>): number {
  const total = part(input.breast) + part(input.formula)
  return Number.isFinite(total) ? total : 0
}
