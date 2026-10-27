import { DAY, localMidnight } from '@lullabo/shared'

import { WHO_LMS } from './who-data'

export type GrowthMeasure = keyof typeof WHO_LMS
export type GrowthSex = 'male' | 'female'

/** Average month length used by the WHO standards. */
const DAYS_PER_MONTH = 30.4375
export const MAX_MONTHS = WHO_LMS.weight.male.length - 1

interface Lms {
  l: number
  m: number
  s: number
}

/** LMS parameters at a (fractional) age in months, linearly interpolated between months. */
export function lmsAt(measure: GrowthMeasure, sex: GrowthSex, months: number): Lms | undefined {
  if (months < 0 || months > MAX_MONTHS) return undefined
  const table = WHO_LMS[measure][sex]
  const lower = Math.floor(months)
  const a = table[lower]
  const b = table[Math.min(lower + 1, MAX_MONTHS)]
  if (!a || !b) return undefined
  const t = months - lower
  const mix = (i: number) => (a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * t
  return { l: mix(0), m: mix(1), s: mix(2) }
}

export function zScore(value: number, { l, m, s }: Lms): number {
  return l === 0 ? Math.log(value / m) / s : ((value / m) ** l - 1) / (l * s)
}

export function valueAtZ(z: number, { l, m, s }: Lms): number {
  return l === 0 ? m * Math.exp(s * z) : m * (1 + l * s * z) ** (1 / l)
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2))
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

/** Percentile (0-100) of a measurement for the baby's age, or undefined outside 0-24 months. */
export function percentileOf(
  measure: GrowthMeasure,
  sex: GrowthSex,
  months: number,
  value: number,
): number | undefined {
  const lms = lmsAt(measure, sex, months)
  return lms ? normalCdf(zScore(value, lms)) * 100 : undefined
}

/** Reference curves drawn on the chart, as percentiles and their z-scores. */
export const REFERENCE_CURVES = [
  { percentile: 3, z: -1.881 },
  { percentile: 15, z: -1.036 },
  { percentile: 50, z: 0 },
  { percentile: 85, z: 1.036 },
  { percentile: 97, z: 1.881 },
] as const

/** Age in months between a birth date ("YYYY-MM-DD", local) and a timestamp. */
export function ageInMonths(birthDate: string, at: number): number {
  return (at - localMidnight(birthDate)) / DAY / DAYS_PER_MONTH
}
