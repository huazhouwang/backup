import { z } from 'zod'

import { checkTimestamps, syncFields, timestampSchema } from './common'
import { idSchema } from './id'
import { recordKindOf } from './record-kinds'

export const breastSideSchema = z.enum(['left', 'right'])

export const breastSegmentSchema = z.object({
  side: breastSideSchema,
  startAt: timestampSchema,
  /** Null while this side is being fed. */
  endAt: timestampSchema.nullable(),
})

export const feedingDataSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('breast'),
    /** One segment per side switch; durations per side are derived from these. */
    segments: z.array(breastSegmentSchema).min(1).max(100),
  }),
  z.object({
    kind: z.literal('bottle'),
    /** Canonical unit is ml; other units are converted on display. */
    amountMl: z.number().positive().max(1000),
    milk: z.enum(['breast', 'formula', 'mixed']),
    /** For mixed bottles: how much of the total was breast milk and formula. */
    breastMl: z.number().min(0).max(1000).optional(),
    formulaMl: z.number().min(0).max(1000).optional(),
  }),
  z.object({
    kind: z.literal('solids'),
    food: z.string().trim().min(1).max(100),
  }),
])

export const sleepDataSchema = z.object({
  kind: z.enum(['nap', 'night']),
})

export const poopDetailsSchema = z.object({
  amount: z.enum(['small', 'normal', 'large']),
  color: z.enum(['yellow', 'brown', 'green', 'black', 'red', 'white']),
  consistency: z.enum(['watery', 'soft', 'hard']),
  /** Undigested milk curds (奶瓣); absent on records logged before it was asked. */
  curds: z.boolean().optional(),
})

export const peeDetailsSchema = z.object({
  amount: z.enum(['small', 'normal', 'large']),
})

export const diaperDataSchema = z.object({
  contents: z.enum(['wet', 'dirty', 'mixed']),
  /** Optional details when the diaper is wet. */
  pee: peeDetailsSchema.optional(),
  /** Optional details when the diaper has poop in it. */
  poop: poopDetailsSchema.optional(),
})

export const pumpingDataSchema = z.object({
  side: z.enum(['left', 'right', 'both']),
  /** Known once pumping is done; absent only while it is still running. */
  amountMl: z.number().positive().max(1000).optional(),
})

export const temperatureDataSchema = z.object({
  /** Canonical unit is °C, kept to one decimal. */
  celsius: z.number().min(30).max(45),
})

export const medicationDataSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** Free text such as "2.5 ml" or "1 片". */
  dose: z.string().trim().max(50).nullable(),
})

/** Reactions noted after a vaccination; none noted is an empty list. */
export const VACCINE_REACTIONS = ['fever', 'swelling', 'fussy'] as const

/**
 * One dose of a vaccine, by its id in VACCINES (or a custom vaccine's) and its number as the
 * booklet counts it; `name` for one no schedule knows, as the family or the booklet calls it.
 */
export const vaccinationDataSchema = z.object({
  vaccineId: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(40).optional(),
  dose: z.number().int().min(1).max(10),
  reactions: z.array(z.enum(VACCINE_REACTIONS)).max(VACCINE_REACTIONS.length),
})

/** Growth measurements; at least one is present. Canonical units are kg and cm. */
export const growthDataSchema = z
  .object({
    weightKg: z.number().min(0.3).max(40).nullable(),
    lengthCm: z.number().min(20).max(130).nullable(),
    headCm: z.number().min(15).max(60).nullable(),
  })
  .refine((data) => data.weightKg !== null || data.lengthCm !== null || data.headCm !== null, {
    message: 'At least one measurement is required',
  })

/** A free-form note; the text lives in the event's `note` field. */
export const noteDataSchema = z.object({})

const eventBase = {
  id: idSchema,
  babyId: idSchema,
  familyId: idSchema.nullable(),
  startAt: timestampSchema,
  /**
   * Duration records (see RECORD_KINDS): null while running, otherwise when they ended; the
   * same as `startAt` when how long they took was not recorded. Instant records never have one.
   */
  endAt: timestampSchema.nullable(),
  note: z.string().trim().max(500).nullable(),
  ...syncFields,
}

export const eventSchema = z
  .discriminatedUnion('type', [
    z.object({ ...eventBase, type: z.literal('feeding'), data: feedingDataSchema }),
    z.object({ ...eventBase, type: z.literal('sleep'), data: sleepDataSchema }),
    z.object({ ...eventBase, type: z.literal('diaper'), data: diaperDataSchema }),
    z.object({ ...eventBase, type: z.literal('pumping'), data: pumpingDataSchema }),
    z.object({ ...eventBase, type: z.literal('temperature'), data: temperatureDataSchema }),
    z.object({ ...eventBase, type: z.literal('medication'), data: medicationDataSchema }),
    z.object({ ...eventBase, type: z.literal('note'), data: noteDataSchema }),
    z.object({ ...eventBase, type: z.literal('growth'), data: growthDataSchema }),
    z.object({ ...eventBase, type: z.literal('vaccination'), data: vaccinationDataSchema }),
  ])
  .superRefine((event, ctx) => {
    checkTimestamps(event, ctx)

    if (event.endAt !== null && event.endAt < event.startAt) {
      ctx.addIssue({ code: 'custom', message: 'endAt must not be before startAt', path: ['endAt'] })
    }
    if (!hasDuration(event) && event.endAt !== null) {
      ctx.addIssue({ code: 'custom', message: 'Instant events have no endAt', path: ['endAt'] })
    }
    if (event.type === 'pumping' && event.endAt !== null && event.data.amountMl === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Finished pumping needs an amount', path: ['data'] })
    }
    if (event.type === 'feeding' && event.data.kind === 'bottle') {
      checkMilkSplit(event.data, ctx)
    }
    if (event.type === 'diaper' && event.data.contents === 'wet' && event.data.poop) {
      ctx.addIssue({ code: 'custom', message: 'Wet diapers have no poop details', path: ['data'] })
    }
    if (event.type === 'diaper' && event.data.contents === 'dirty' && event.data.pee) {
      ctx.addIssue({ code: 'custom', message: 'Dirty diapers have no pee details', path: ['data'] })
    }
    if (event.type === 'note' && event.note === null) {
      ctx.addIssue({ code: 'custom', message: 'Notes need text', path: ['note'] })
    }
    if (event.type === 'feeding' && event.data.kind === 'breast') {
      checkBreastSegments(event.data.segments, event.startAt, event.endAt, ctx)
    }
  })

export type Event = z.infer<typeof eventSchema>
export type EventType = Event['type']
/** Every record type, in eventSchema's order. */
export const EVENT_TYPES = [
  'feeding',
  'sleep',
  'diaper',
  'pumping',
  'temperature',
  'medication',
  'note',
  'growth',
  'vaccination',
] as const satisfies readonly EventType[]
export type FeedingEvent = Extract<Event, { type: 'feeding' }>
export type SleepEvent = Extract<Event, { type: 'sleep' }>
export type DiaperEvent = Extract<Event, { type: 'diaper' }>
export type PumpingEvent = Extract<Event, { type: 'pumping' }>
export type TemperatureEvent = Extract<Event, { type: 'temperature' }>
export type MedicationEvent = Extract<Event, { type: 'medication' }>
export type NoteEvent = Extract<Event, { type: 'note' }>
export type GrowthEvent = Extract<Event, { type: 'growth' }>
export type VaccinationEvent = Extract<Event, { type: 'vaccination' }>
export type VaccineReaction = (typeof VACCINE_REACTIONS)[number]
export type FeedingData = z.infer<typeof feedingDataSchema>
export type BreastSide = z.infer<typeof breastSideSchema>
export type BreastSegment = z.infer<typeof breastSegmentSchema>
export type PoopDetails = z.infer<typeof poopDetailsSchema>
export type PeeDetails = z.infer<typeof peeDetailsSchema>

/** A split is only for mixed bottles, needs both parts, and must add up to the total. */
function checkMilkSplit(
  data: { amountMl: number; milk: string; breastMl?: number; formulaMl?: number },
  ctx: z.RefinementCtx,
) {
  const { breastMl, formulaMl } = data
  if (breastMl === undefined && formulaMl === undefined) return
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['data'] })
  if (data.milk !== 'mixed') issue('Only mixed bottles are split')
  else if (breastMl === undefined || formulaMl === undefined) issue('A split needs both parts')
  else if (Math.abs(breastMl + formulaMl - data.amountMl) > 0.5) {
    issue('Breast milk and formula must add up to the amount')
  }
}

/**
 * Segments must be in order without gaps or overlaps, start with the event, and only the
 * last one may be open, exactly when the event itself is still running.
 */
function checkBreastSegments(
  segments: BreastSegment[],
  startAt: number,
  endAt: number | null,
  ctx: z.RefinementCtx,
) {
  const issue = (message: string) =>
    ctx.addIssue({ code: 'custom', message, path: ['data', 'segments'] })

  if (segments[0]?.startAt !== startAt) issue('First segment must start with the event')

  segments.forEach((segment, index) => {
    const next = segments[index + 1]
    if (next) {
      if (segment.endAt === null) issue('Only the last segment may be open')
      else if (next.startAt !== segment.endAt) issue('Segments must be contiguous')
    }
    if (segment.endAt !== null && segment.endAt < segment.startAt) {
      issue('Segment ends before it starts')
    }
  })

  const lastEnd = segments.at(-1)?.endAt ?? null
  if (lastEnd !== endAt) issue('Last segment must end with the event')
}

/** Whether the record spans time: it can run as a timer, or have a start and an end. */
export function hasDuration(event: Pick<Event, 'type' | 'data'>): boolean {
  return recordKindOf(event).timing === 'duration'
}

export function isRunning(event: Pick<Event, 'type' | 'data' | 'endAt'>): boolean {
  return hasDuration(event) && event.endAt === null
}

/** A finished duration record whose length was recorded (not just its start). */
export function hasKnownDuration(event: Pick<Event, 'type' | 'data' | 'startAt' | 'endAt'>) {
  return hasDuration(event) && event.endAt !== null && event.endAt > event.startAt
}

/**
 * Elapsed time of an event; running timers count up to `now`. Instants without an end are 0.
 */
export function eventDurationMs(
  event: Pick<Event, 'type' | 'data' | 'startAt' | 'endAt'>,
  now: number,
): number {
  const end = event.endAt ?? (hasDuration(event) ? now : event.startAt)
  return Math.max(0, end - event.startAt)
}

export function breastSideDurations(
  segments: readonly BreastSegment[],
  now: number,
): Record<BreastSide, number> {
  const totals: Record<BreastSide, number> = { left: 0, right: 0 }
  for (const segment of segments) {
    totals[segment.side] += Math.max(0, (segment.endAt ?? now) - segment.startAt)
  }
  return totals
}
