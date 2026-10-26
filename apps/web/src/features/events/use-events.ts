import { type Event, isRunning } from '@bobo/shared'
import { and, count, eq, inArray, isNull } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'

import { useLocalStore } from '../../db'
import { newestFirst } from './order'

const NO_EVENTS: Event[] = []

/** All non-deleted events of a baby, newest first. */
export function useBabyEvents(babyId: string): Event[] {
  const { events } = useLocalStore()
  const { data } = useLiveQuery(
    (q) =>
      q
        .from({ event: events })
        .where(({ event }) => and(eq(event.babyId, babyId), isNull(event.deletedAt)))
        .orderBy(({ event }) => event.startAt, 'desc'),
    [events, babyId],
  )
  return useMemo(() => (data ? data.toSorted(newestFirst) : NO_EVENTS), [data])
}

/** Ids of babies that have a timer running, for indicators across babies. */
export function useBabiesWithRunningTimers(): Set<string> {
  const { events } = useLocalStore()
  // Only events without an end can be running; isRunning narrows them to timed types.
  const { data } = useLiveQuery(
    (q) =>
      q
        .from({ event: events })
        .where(({ event }) => and(isNull(event.endAt), isNull(event.deletedAt))),
    [events],
  )
  return useMemo(
    () => new Set((data ?? NO_EVENTS).filter(isRunning).map((event) => event.babyId)),
    [data],
  )
}

/** Non-deleted events of several babies, newest first, keyed by baby. */
export function useEventsByBaby(babyIds: readonly string[]): ReadonlyMap<string, Event[]> {
  const { events } = useLocalStore()
  const key = babyIds.join(',')
  const { data } = useLiveQuery(
    (q) =>
      q
        .from({ event: events })
        .where(({ event }) => and(inArray(event.babyId, key.split(',')), isNull(event.deletedAt)))
        .orderBy(({ event }) => event.startAt, 'desc'),
    [events, key],
  )
  return useMemo(() => {
    const byBaby = new Map<string, Event[]>(key.split(',').map((id) => [id, []]))
    for (const event of (data ?? NO_EVENTS).toSorted(newestFirst)) {
      byBaby.get(event.babyId)?.push(event)
    }
    return byBaby
  }, [data, key])
}

/** How many non-deleted records a baby (or a whole family) has, kept up to date. */
export function useRecordCount(scope: { babyId: string } | { familyId: string } | undefined) {
  const { events } = useLocalStore()
  const babyId = scope && 'babyId' in scope ? scope.babyId : undefined
  const familyId = scope && 'familyId' in scope ? scope.familyId : undefined
  const { data } = useLiveQuery(
    (q) => {
      if (babyId === undefined && familyId === undefined) return undefined
      return q
        .from({ event: events })
        .where(({ event }) =>
          and(
            babyId === undefined ? eq(event.familyId, familyId) : eq(event.babyId, babyId),
            isNull(event.deletedAt),
          ),
        )
        .select(({ event }) => ({ n: count(event.id) }))
        .findOne()
    },
    [events, babyId, familyId],
  )
  return data?.n ?? 0
}
