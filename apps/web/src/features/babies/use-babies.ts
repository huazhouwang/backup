import type { Baby } from '@lullabo/shared'
import { isNull } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useCallback, useMemo } from 'react'

import { useLocalStore } from '../../db'
import { createStoredValue, stringCodec, useStore } from '../../lib/store'
import { isActiveBaby, resolveSelectedBaby } from './records'

export function useBabies(): { active: Baby[]; archived: Baby[] } {
  const { babies } = useLocalStore()
  // Creation order, as sortBabies; the selection falls back to the first active baby.
  const { data } = useLiveQuery(
    (q) =>
      q
        .from({ baby: babies })
        .where(({ baby }) => isNull(baby.deletedAt))
        .orderBy(({ baby }) => baby.createdAt)
        .orderBy(({ baby }) => baby.id),
    [babies],
  )

  return useMemo(() => {
    const all = data ?? []
    return {
      active: all.filter(isActiveBaby),
      archived: all.filter((baby) => !isActiveBaby(baby)),
    }
  }, [data])
}

// The selected baby is a per-device preference, not synced data.
const selectedBabyId = createStoredValue('lullabo.selectedBabyId', stringCodec, null)

export const selectBaby = (id: string) => selectedBabyId.set(id)

export function useSelectedBaby(): {
  baby: Baby | undefined
  select: (id: string) => void
} {
  const { active } = useBabies()
  const storedId = useStore(selectedBabyId)
  const baby = useMemo(() => resolveSelectedBaby(active, storedId), [active, storedId])
  const select = useCallback((id: string) => selectBaby(id), [])
  return { baby, select }
}
