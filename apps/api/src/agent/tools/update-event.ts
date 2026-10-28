import { eventSchema, hasDuration } from '@lullabo/shared'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import { clockToTime } from '../../time-zone'
import { type Change, writeChanges } from '../data'
import { voiceActionSchema } from '../plan/action'
import { editedBottle } from '../plan/plan'
import {
  REFUSED,
  type ToolContext,
  confirmedSchema,
  doubt,
  line,
  resultSchema,
  retimed,
} from './shared'

/** Changes one record at once. */
export function updateEvent(ctx: ToolContext) {
  const { db, access, userId, now, timeZone, log, saved, ownEvent } = ctx
  return toolDefinition({
    name: 'update_event',
    description:
      'Change one record (its id from find_events). Only the fields given change; leave the ' +
      'rest null. It changes at once; tell the user what changed, as the result says.',
    inputSchema: z.object({
      id: z.string(),
      time: z.string().nullable().meta({ description: 'New start time, HH:MM' }),
      endTime: z.string().nullable().meta({ description: 'New end time for timed records, HH:MM' }),
      durationMinutes: z
        .number()
        .nullable()
        .meta({ description: 'New length of a finished timed record; the start stays' }),
      amountMl: z.number().nullable().meta({ description: 'Bottle total, or pumped amount' }),
      milk: voiceActionSchema.shape.milk,
      breastMl: voiceActionSchema.shape.breastMl,
      formulaMl: voiceActionSchema.shape.formulaMl,
      diaper: z.enum(['wet', 'dirty', 'mixed']).nullable(),
      food: z.string().nullable(),
      celsius: z.number().nullable(),
      note: z.string().nullable(),
      confirmed: confirmedSchema,
    }),
    outputSchema: resultSchema,
  }).server(async (input) => {
    const found = await ownEvent(input.id)
    if (!found) return { ok: false, message: '找不到这条记录。' }
    const { event, known } = found
    const at = (clock: string | null) => (clock ? clockToTime(clock, now, timeZone) : null)
    const startAt = at(input.time) ?? event.startAt
    const endAt =
      at(input.endTime) ??
      (input.durationMinutes !== null && input.durationMinutes > 0 && event.endAt !== null
        ? startAt + Math.round(input.durationMinutes) * 60_000
        : event.endAt === null
          ? null
          : event.endAt + (startAt - event.startAt))
    const next: Record<string, unknown> = { ...event, startAt, endAt, updatedAt: now }
    if (!hasDuration(event)) next.endAt = event.endAt
    if (input.note !== null) next.note = input.note.trim() || null
    switch (event.type) {
      case 'feeding': {
        const { data } = event
        if (data.kind === 'breast')
          next.data = { ...data, segments: retimed(data.segments, startAt, endAt) }
        if (data.kind === 'solids' && input.food?.trim())
          next.data = { ...data, food: input.food.trim() }
        if (
          data.kind === 'bottle' &&
          (input.amountMl !== null ||
            input.milk !== null ||
            input.breastMl !== null ||
            input.formulaMl !== null)
        ) {
          const edited = editedBottle(input, data)
          if ('reply' in edited) return { ok: false, message: edited.reply }
          next.data = edited.data
        }
        break
      }
      case 'pumping':
        if (input.amountMl !== null)
          next.data = { ...event.data, amountMl: Math.round(input.amountMl) }
        break
      case 'diaper':
        if (input.diaper !== null) {
          const { diaper } = input
          next.data = {
            contents: diaper,
            ...(diaper === 'dirty' ? {} : { pee: { amount: 'normal' } }),
          }
        }
        break
      case 'temperature':
        if (input.celsius !== null) next.data = { celsius: Math.round(input.celsius * 10) / 10 }
        break
      default:
        break
    }
    const parsed = eventSchema.safeParse(next)
    if (!parsed.success) return { ok: false, message: '这样改不行，请换个说法。' }
    const change: Change = { event: parsed.data, before: event }
    if (!input.confirmed) {
      // Checked as said, not as a stopped timer: an edit sets the times on purpose.
      const doubted = doubt([{ event: parsed.data, before: null }], known, now, timeZone)
      if (doubted) return doubted
    }
    const refused = await writeChanges(db, access, userId, log, [change], now)
    if (refused) return { ok: false, message: REFUSED[refused] ?? refused }
    const was = line(event, null, known, timeZone)
    const is = line(parsed.data, null, known, timeZone)
    return saved(`已修改：${was} → ${is}。说「撤销」可以改回来`)
  })
}
