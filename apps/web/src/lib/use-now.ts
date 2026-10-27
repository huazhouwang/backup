import { useEffect, useState } from 'react'

/**
 * Current time, refreshed every `intervalMs` while `active`. Timers derive from this. The
 * refreshes fall on whole intervals of the clock (every minute on the minute), so a time
 * shown to the minute turns when the clock does, not up to a minute later.
 */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    let id: ReturnType<typeof setTimeout>
    const tick = () => {
      const current = Date.now()
      setNow(current)
      id = setTimeout(tick, intervalMs - (current % intervalMs))
    }
    id = setTimeout(tick, intervalMs - (Date.now() % intervalMs))
    // Catch up immediately when the app returns from the background.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs, active])
  return now
}
