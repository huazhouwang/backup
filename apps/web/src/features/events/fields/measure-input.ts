import { parseQuantity, rangeParams } from '../../../lib/units'
import { m } from '../../../paraglide/messages.js'

/** Largest bottle or pumping amount accepted, in milliliters. */
export const MAX_ML = 1000

/** Plausible body temperatures; the schema allows a wider range for unusual readings. */
const MIN_CELSIUS = 34
const MAX_CELSIUS = 43

const volumeInvalid = () => m.bottleAmountInvalid(rangeParams('volume', 0, MAX_ML))

/** An amount entered in display units, in milliliters. */
export function parseVolume(input: string): { amountMl: number } | { error: string } {
  const amountMl = parseQuantity('volume', input)
  return amountMl > 0 && amountMl <= MAX_ML ? { amountMl } : { error: volumeInvalid() }
}

/** A temperature entered in display units, in degrees Celsius. */
export function parseTemperature(input: string): { celsius: number } | { error: string } {
  const celsius = parseQuantity('temperature', input)
  return celsius >= MIN_CELSIUS && celsius <= MAX_CELSIUS
    ? { celsius }
    : { error: m.temperatureInvalid(rangeParams('temperature', MIN_CELSIUS, MAX_CELSIUS)) }
}
