import { m } from '../paraglide/messages.js'
import { formatNumber } from './i18n'
import { createStoredValue, jsonCodec, useStore } from './store'

/**
 * Display units. Records always store milliliters, kilograms, centimeters and degrees Celsius;
 * these preferences only change how values are shown and entered.
 */
export interface UnitPreferences {
  volume: 'ml' | 'oz'
  weight: 'kg' | 'lb'
  length: 'cm' | 'in'
  temperature: 'c' | 'f'
}

export type Quantity = keyof UnitPreferences

const UNITS_STORAGE_KEY = 'lullabo.units'

export const DEFAULT_UNITS: UnitPreferences = {
  volume: 'ml',
  weight: 'kg',
  length: 'cm',
  temperature: 'c',
}

const ML_PER_OZ = 29.5735295625
const KG_PER_LB = 0.45359237
const CM_PER_IN = 2.54

interface UnitSpec {
  /** Canonical value to display value. */
  toDisplay: (value: number) => number
  /** Display value to canonical value. */
  toCanonical: (value: number) => number
  /** Fraction digits shown, and accepted on input. */
  digits: number
  /** Fraction digits kept when storing an entered value. */
  storedDigits: number
  label: () => string
}

const identity = (value: number) => value

const specs: { [Q in Quantity]: Record<UnitPreferences[Q], UnitSpec> } = {
  volume: {
    ml: { toDisplay: identity, toCanonical: identity, digits: 0, storedDigits: 1, label: m.unitMl },
    oz: {
      toDisplay: (ml) => ml / ML_PER_OZ,
      toCanonical: (oz) => oz * ML_PER_OZ,
      digits: 1,
      storedDigits: 1,
      label: m.unitOz,
    },
  },
  weight: {
    kg: { toDisplay: identity, toCanonical: identity, digits: 2, storedDigits: 3, label: m.unitKg },
    lb: {
      toDisplay: (kg) => kg / KG_PER_LB,
      toCanonical: (lb) => lb * KG_PER_LB,
      digits: 2,
      storedDigits: 3,
      label: m.unitLb,
    },
  },
  length: {
    cm: { toDisplay: identity, toCanonical: identity, digits: 1, storedDigits: 2, label: m.unitCm },
    in: {
      toDisplay: (cm) => cm / CM_PER_IN,
      toCanonical: (inches) => inches * CM_PER_IN,
      digits: 1,
      storedDigits: 2,
      label: m.unitIn,
    },
  },
  temperature: {
    c: { toDisplay: identity, toCanonical: identity, digits: 1, storedDigits: 2, label: m.unitC },
    f: {
      toDisplay: (c) => (c * 9) / 5 + 32,
      toCanonical: (f) => ((f - 32) * 5) / 9,
      digits: 1,
      storedDigits: 2,
      label: m.unitF,
    },
  },
}

const round = (value: number, digits: number) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

const isUnit = <Q extends Quantity>(quantity: Q, value: unknown): value is UnitPreferences[Q] =>
  typeof value === 'string' && Object.hasOwn(specs[quantity], value)

export function parseUnitPreferences(value: unknown): UnitPreferences {
  const raw: Record<string, unknown> =
    typeof value === 'object' && value !== null ? { ...value } : {}
  const pick = <Q extends Quantity>(quantity: Q): UnitPreferences[Q] => {
    const candidate = raw[quantity]
    return isUnit(quantity, candidate) ? candidate : DEFAULT_UNITS[quantity]
  }
  return {
    volume: pick('volume'),
    weight: pick('weight'),
    length: pick('length'),
    temperature: pick('temperature'),
  }
}

const unitStore = createStoredValue(
  UNITS_STORAGE_KEY,
  jsonCodec(parseUnitPreferences),
  DEFAULT_UNITS,
)

export const getUnits = (): UnitPreferences => unitStore.get()
export const setUnits = (next: UnitPreferences) => unitStore.set(next)

/** The current unit preferences; re-renders when they change. */
export const useUnits = (): UnitPreferences => useStore(unitStore)

function spec(quantity: Quantity, units: UnitPreferences): UnitSpec {
  const byUnit: Record<string, UnitSpec> = specs[quantity]
  const found = byUnit[units[quantity]] ?? byUnit[DEFAULT_UNITS[quantity]]
  if (!found) throw new Error(`No unit for ${quantity}`)
  return found
}

/** Unit label such as "毫升" or "盎司". */
export function unitLabel(quantity: Quantity, units: UnitPreferences = getUnits()): string {
  return spec(quantity, units).label()
}

/** A stored value in display units, unrounded (e.g. for chart geometry). */
export function convertToDisplay(
  quantity: Quantity,
  value: number,
  units: UnitPreferences = getUnits(),
): number {
  return spec(quantity, units).toDisplay(value)
}

/** A stored value in display units, rounded as shown. */
export function toDisplay(
  quantity: Quantity,
  value: number,
  units: UnitPreferences = getUnits(),
): number {
  const unit = spec(quantity, units)
  return round(unit.toDisplay(value), unit.digits)
}

/** A stored value as a localized number in display units, without the unit. */
export function formatQuantity(
  quantity: Quantity,
  value: number,
  units: UnitPreferences = getUnits(),
): string {
  const unit = spec(quantity, units)
  const digits = quantity === 'temperature' ? unit.digits : 0
  return formatNumber(unit.toDisplay(value), {
    minimumFractionDigits: digits,
    maximumFractionDigits: unit.digits,
  })
}

/**
 * A stored value as an editable string in display units, e.g. for a form's initial value.
 * Precise enough that saving it unchanged stores the same value again.
 */
export function inputValue(
  quantity: Quantity,
  value: number,
  units: UnitPreferences = getUnits(),
): string {
  const unit = spec(quantity, units)
  return String(round(unit.toDisplay(value), unit.storedDigits))
}

/** An entered display value converted to the stored unit; NaN when it isn't a number. */
export function parseQuantity(
  quantity: Quantity,
  input: string,
  units: UnitPreferences = getUnits(),
): number {
  const trimmed = input.trim()
  if (trimmed === '') return Number.NaN
  const unit = spec(quantity, units)
  return round(unit.toCanonical(Number(trimmed)), unit.storedDigits)
}

/** Number input attributes for entering a quantity in display units. */
export function quantityInputProps(quantity: Quantity, units: UnitPreferences = getUnits()) {
  const { digits } = spec(quantity, units)
  return {
    type: 'number',
    inputMode: digits === 0 ? 'numeric' : 'decimal',
    step: digits === 0 ? '1' : String(10 ** -digits),
  } as const
}

/** Message parameters describing an accepted range of stored values, in display units. */
export function rangeParams(
  quantity: Quantity,
  min: number,
  max: number,
  units: UnitPreferences = getUnits(),
): { min: string; max: string; unit: string } {
  return {
    min: formatQuantity(quantity, min, units),
    max: formatQuantity(quantity, max, units),
    unit: unitLabel(quantity, units),
  }
}
