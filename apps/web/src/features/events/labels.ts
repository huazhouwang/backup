import type { PoopDetails } from '@lullabo/shared'

import { m } from '../../paraglide/messages.js'

export const poopColorLabel: Record<PoopDetails['color'], () => string> = {
  yellow: m.poopYellow,
  brown: m.poopBrown,
  green: m.poopGreen,
  black: m.poopBlack,
  red: m.poopRed,
  white: m.poopWhite,
}

/** 少 / 正常 / 多, for both pee and poop. */
export const amountLabel: Record<PoopDetails['amount'], () => string> = {
  small: m.poopAmountSmall,
  normal: m.poopAmountNormal,
  large: m.poopAmountLarge,
}

export const poopConsistencyLabel: Record<PoopDetails['consistency'], () => string> = {
  watery: m.poopWatery,
  soft: m.poopSoft,
  hard: m.poopHard,
}

/** 左侧 / 右侧 / 两侧, for breastfeeding and pumping. */
export const sideLabel: Record<'left' | 'right' | 'both', () => string> = {
  left: m.sideLeft,
  right: m.sideRight,
  both: m.pumpingBoth,
}

export const milkLabel: Record<'formula' | 'breast' | 'mixed', () => string> = {
  formula: m.milkFormula,
  breast: m.milkBreast,
  mixed: m.milkMixed,
}

export const sleepKindLabel: Record<'nap' | 'night', () => string> = {
  nap: m.sleepNap,
  night: m.sleepNight,
}

/** Options for a SegmentedControl, in the order given. */
export const optionsOf = <T extends string>(
  labels: Record<T, () => string>,
  values: readonly T[],
) => values.map((value) => ({ value, label: labels[value]() }))
