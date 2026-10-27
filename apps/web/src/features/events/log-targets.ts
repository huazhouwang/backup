import { useCallback, useMemo } from 'react'

import { createStoredValue, jsonCodec, stringList, useStore } from '../../lib/store'

// Babies to log for together (e.g. twins); a per-device preference, not synced data.
const logTogether = createStoredValue<string[]>('lullabo.logTogether', jsonCodec(stringList), [])

/**
 * Babies that are logged together with the selected one. The list is stored as a whole, so
 * twins stay linked whichever of them is selected.
 */
export function useLogTogether(): {
  together: ReadonlySet<string>
  toggle: (babyId: string, currentId: string) => void
} {
  const ids = useStore(logTogether)
  const together = useMemo(() => new Set(ids), [ids])
  const toggle = useCallback((babyId: string, currentId: string) => {
    const next = new Set(logTogether.get())
    if (next.has(babyId)) {
      next.delete(babyId)
      // A group of one isn't a group: unlinking the last other baby clears the selection.
      if (next.size === 1) next.clear()
    } else {
      next.add(babyId)
      next.add(currentId)
    }
    logTogether.set([...next])
  }, [])
  return { together, toggle }
}
