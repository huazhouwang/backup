import { and, isNull } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useEffect, useRef } from 'react'

import { useLocalStore } from '../../db'
import { stopSound, useSoundPlaying } from './player'

/** Stops the sound when a baby wakes: a sleep that was running ends, here or elsewhere. */
export function SoundKeeper() {
  const playing = useSoundPlaying()
  return playing ? <StopWhenAwake /> : null
}

function StopWhenAwake() {
  const { events } = useLocalStore()
  const { data } = useLiveQuery(
    (q) =>
      q
        .from({ event: events })
        .where(({ event }) => and(isNull(event.endAt), isNull(event.deletedAt))),
    [events],
  )
  const sleeping = (data ?? []).filter((event) => event.type === 'sleep').map((event) => event.id)
  const key = sleeping.join(',')
  const before = useRef<string[] | null>(null)
  useEffect(() => {
    const now = key === '' ? [] : key.split(',')
    if (before.current?.some((id) => !now.includes(id))) stopSound()
    before.current = now
  }, [key])
  return null
}
