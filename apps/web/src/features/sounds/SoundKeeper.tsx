import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useEffect } from 'react'

import { useLocalStore } from '../../db'
import { stopSound, useSoundPlaying } from './player'

/** Stops the sound when the sleep it plays for ends, however it ends (here, elsewhere). */
export function SoundKeeper() {
  const playing = useSoundPlaying()
  return playing ? <StopWhenAwake sleepId={playing.sleepId} /> : null
}

function StopWhenAwake({ sleepId }: { sleepId: string }) {
  const { events } = useLocalStore()
  const { data } = useLiveQuery(
    (q) => q.from({ event: events }).where(({ event }) => eq(event.id, sleepId)),
    [events, sleepId],
  )
  const sleep = data?.[0]
  const awake = data !== undefined && (!sleep || sleep.endAt !== null || sleep.deletedAt !== null)
  useEffect(() => {
    if (awake) stopSound()
  }, [awake])
  return null
}
