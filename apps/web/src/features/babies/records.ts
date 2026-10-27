import { type AvatarColor, type Baby, type BabySex, newId } from '@lullabo/shared'

export interface BabyInput {
  name: string
  birthDate: string
  sex: BabySex
  avatarColor: AvatarColor
}

export function buildBaby(input: BabyInput, now: number = Date.now()): Baby {
  return {
    id: newId(now),
    familyId: null,
    name: input.name.trim(),
    birthDate: input.birthDate,
    sex: input.sex,
    avatarColor: input.avatarColor,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: null,
  }
}

export function isActiveBaby(baby: Baby): boolean {
  return baby.archivedAt === null && baby.deletedAt === null
}

/** Active babies first by creation order; the selection falls back to the first one. */
export function sortBabies(babies: readonly Baby[]): Baby[] {
  return babies.toSorted((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export function resolveSelectedBaby(
  babies: readonly Baby[],
  storedId: string | null,
): Baby | undefined {
  const active = sortBabies(babies.filter(isActiveBaby))
  return active.find((baby) => baby.id === storedId) ?? active[0]
}

export const AVATAR_COLORS: readonly AvatarColor[] = [
  'green',
  'blue',
  'orange',
  'purple',
  'pink',
  'yellow',
]

/** Picks a color not yet used by another active baby, so twins look different by default. */
export function nextAvatarColor(babies: readonly Baby[]): AvatarColor {
  const used = new Set(babies.filter(isActiveBaby).map((baby) => baby.avatarColor))
  return AVATAR_COLORS.find((color) => !used.has(color)) ?? 'green'
}
