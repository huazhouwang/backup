import type { Event } from '@lullabo/shared'

import { parseEvent } from '../sync/protocol'

/** An events row as EVENT_COLUMNS reads it: `data` is still JSON. */
export type EventRow = Omit<Event, 'data'> & { data: string }

/** A pulled row as an event, without its `seq`; it is not validated again. */
export function toEvent({ seq: _seq, data, ...event }: EventRow & { seq?: number }): Event {
  // Rows are validated against the event schema when written; re-validating every pulled
  // row would spend the CPU budget (10ms on the free plan) for no gain.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.assign(event, { data: JSON.parse(data) as unknown }) as Event
}

/** Rows as events, each validated against the event schema: one that fails is left out. */
export function toEvents(rows: EventRow[]): Event[] {
  return rows.flatMap((row) => {
    const event = parseEvent({ ...row, data: JSON.parse(row.data) })
    return event ? [event] : []
  })
}
