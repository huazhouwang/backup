import {
  type BreastSegment,
  DAY,
  type Event,
  eventSchema,
  hasDuration,
  tipById,
} from '@bobo/shared'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import type { Access, FamilyAccess } from '../access'
import { voiceActionSchema } from '../voice/action'
import {
  type VoiceBaby,
  clockToTime,
  describe,
  editedBottle,
  formatClock,
  planActions,
} from '../voice/plan'
import {
  type Change,
  eventsByIds,
  recentEvents,
  runningEvents,
  undoLastTurn,
  writableBabies,
  writeChanges,
} from './data'
import { ageOn, implausible, nextUpLines } from './guide'
import { stageText, tipText } from './tips'

/** Everything a turn's tools act on: one user, their families, one thread. */
export interface AgentContext {
  db: D1Database
  access: Access
  /** The families this turn may act in. */
  families: FamilyAccess[]
  userId: string
  threadId: string
  runId: string
  now: number
  timeZone: string
  state: {
    /** Set by end_conversation: the shortcut stops asking. */
    done: boolean
    /** What this turn saved, in a line each: the turn answers with them, no model call. */
    saved: string[]
  }
}

/** Enough of the last week for nextUp, and a night that started before it. */
const NEXT_UP_HISTORY = 15 * DAY

const resultSchema = z.object({ ok: z.boolean(), message: z.string() })
const EVENT_TYPES = [
  'feeding',
  'sleep',
  'diaper',
  'pumping',
  'temperature',
  'medication',
  'note',
  'growth',
] as const

function line(event: Event, before: Event | null, babies: VoiceBaby[], timeZone: string) {
  const name = babies.find((baby) => baby.id === event.babyId)?.name ?? ''
  const at = before && event.endAt !== null && before.endAt === null ? event.endAt : event.startAt
  return `${name} ${formatClock(at, timeZone)} ${describe(event, before)}`
}

const confirmedSchema = z
  .boolean()
  .meta({ description: 'True only after the parent confirmed a value that looked misheard' })

/**
 * Breastfeed sides moved with a new start, the last side ending at the new end. A side that
 * would end before it starts is dropped (the feed got shorter than it was).
 */
function retimed(segments: BreastSegment[], startAt: number, endAt: number | null) {
  const shift = startAt - (segments[0]?.startAt ?? startAt)
  const moved = segments
    .map((segment) => ({
      ...segment,
      startAt: segment.startAt + shift,
      endAt: segment.endAt === null ? null : segment.endAt + shift,
    }))
    .filter((segment, index) => index === 0 || endAt === null || segment.startAt < endAt)
  const last = moved.at(-1)
  if (last) last.endAt = endAt
  return moved
}

/** The first change that looks misheard, as a refusal telling the assistant to ask. */
function doubt(changes: Change[], babies: VoiceBaby[], now: number, timeZone: string) {
  for (const { event, before } of changes) {
    const birthDate = babies.find((baby) => baby.id === event.babyId)?.birthDate
    const reason = birthDate ? implausible(event, before, birthDate, now, timeZone) : null
    if (reason) {
      return {
        ok: false,
        message: `没有记录：${reason}，可能听错了。先用一句话问家长（说出你猜的正确值），家长确认后再带上 confirmed: true 调用。`,
      }
    }
  }
  return null
}

const REFUSED: Record<string, string> = {
  forbidden: '没有权限做这个操作。',
  family_mismatch: '这条记录不属于这个家庭。',
}

/** The tools for one turn, bound to its context. */
export function agentTools(ctx: AgentContext) {
  const { db, access, families, userId, now, timeZone } = ctx
  const babies = () => writableBabies(db, families)
  const log = { threadId: ctx.threadId, runId: ctx.runId }
  /** A change made: kept for the turn's answer, and told to the model. */
  const saved = (message: string) => {
    ctx.state.saved.push(message)
    return { ok: true, message }
  }

  /** One of the family's events, if the user may see it. */
  async function ownEvent(id: string) {
    const [event] = await eventsByIds(db, [id])
    const known = await babies()
    return event && event.deletedAt === null && known.some((baby) => baby.id === event.babyId)
      ? { event, known }
      : null
  }

  const listBabies = toolDefinition({
    name: 'list_babies',
    description:
      "The family's babies, the timers each has running, and what likely comes next for " +
      'each (feeds, sleep, diapers), from their age and last week.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      babies: z.array(
        z.object({ name: z.string(), running: z.array(z.string()), next: z.array(z.string()) }),
      ),
    }),
  }).server(async () => {
    const known = await babies()
    const running = await runningEvents(db, known)
    const recent = await recentEvents(
      db,
      known.map((baby) => baby.id),
      now - NEXT_UP_HISTORY,
      null,
      2000,
    )
    return {
      babies: known.map((baby) => ({
        name: baby.name,
        running: running
          .filter((event) => event.babyId === baby.id)
          .map((event) => line(event, null, known, timeZone)),
        next: nextUpLines(
          recent.filter((event) => event.babyId === baby.id),
          baby.birthDate,
          now,
          timeZone,
        ),
      })),
    }
  })

  const findEvents = toolDefinition({
    name: 'find_events',
    description:
      'Recent records, newest first, with ids for update_event and delete_event. Use it to ' +
      'answer questions ("上次喂奶是什么时候", "今天喝了多少") and to find a record to change.',
    inputSchema: z.object({
      baby: z.string().nullable().meta({ description: 'Baby name, or null for all' }),
      type: z.enum(EVENT_TYPES).nullable(),
      hours: z
        .number()
        .min(1)
        .max(24 * 14)
        .meta({ description: 'How far back to look' }),
    }),
    outputSchema: z.object({
      events: z.array(z.object({ id: z.string(), date: z.string(), summary: z.string() })),
    }),
  }).server(async ({ baby, type, hours }) => {
    const known = await babies()
    const chosen = baby ? known.filter((item) => item.name.includes(baby)) : known
    const events = await recentEvents(
      db,
      chosen.map((item) => item.id),
      now - hours * 3_600_000,
      type,
      50,
    )
    return {
      events: events.map((event) => ({
        id: event.id,
        date: new Intl.DateTimeFormat('zh-CN', {
          timeZone,
          month: 'numeric',
          day: 'numeric',
        }).format(event.startAt),
        summary: line(event, null, known, timeZone),
      })),
    }
  })

  const record = toolDefinition({
    name: 'record',
    description:
      'Add records, start timers and stop them (type stop: "醒了", "喂完了", "吸完了"). Use ' +
      'one call for everything said in one sentence.',
    inputSchema: z.object({
      actions: z.array(voiceActionSchema).min(1),
      confirmed: confirmedSchema,
    }),
    outputSchema: resultSchema,
  }).server(async ({ actions, confirmed }) => {
    const known = await babies()
    const running = await runningEvents(db, known)
    const plan = planActions(
      actions.filter((action) => action.type !== 'undo'),
      {
        babies: known,
        running,
        userId,
        now,
        timeZone,
      },
    )
    if (plan.kind !== 'changes')
      return { ok: false, message: plan.kind === 'reply' ? plan.reply : '' }
    if (!confirmed) {
      const doubted = doubt(plan.changes, known, now, timeZone)
      if (doubted) return doubted
    }
    const refused = await writeChanges(db, access, userId, log, plan.changes, now)
    if (refused) return { ok: false, message: REFUSED[refused] ?? refused }
    return saved(`已记录：${plan.lines.join('；')}`)
  })

  const updateEvent = toolDefinition({
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

  const deleteEvent = toolDefinition({
    name: 'delete_event',
    description:
      "Delete one record (its id from find_events). Needs the user's approval, which they " +
      'give in their next message.',
    inputSchema: z.object({ id: z.string() }),
    outputSchema: resultSchema,
    needsApproval: true,
  }).server(async ({ id }) => {
    const found = await ownEvent(id)
    if (!found) return { ok: false, message: '找不到这条记录。' }
    const { event, known } = found
    const change: Change = { event: { ...event, deletedAt: now, updatedAt: now }, before: event }
    const refused = await writeChanges(db, access, userId, log, [change], now)
    if (refused) return { ok: false, message: REFUSED[refused] ?? refused }
    return saved(`已删除：${line(event, null, known, timeZone)}`)
  })

  const undo = toolDefinition({
    name: 'undo',
    description: 'Undo what the latest change in this conversation did ("撤销", "记错了").',
    inputSchema: z.object({}),
    outputSchema: resultSchema,
  }).server(async () => {
    const known = await babies()
    const babyIds = new Set(known.map((baby) => baby.id))
    const result = await undoLastTurn(db, access, userId, ctx.threadId, babyIds, now)
    if ('refused' in result)
      return { ok: false, message: REFUSED[result.refused] ?? result.refused }
    if (result.reverted.length === 0) return { ok: false, message: '没有可以撤销的操作。' }
    return saved(
      `已撤销：${result.reverted.map((event) => line(event, null, known, timeZone)).join('；')}`,
    )
  })

  const readTips = toolDefinition({
    name: 'read_tips',
    description:
      "The app's parenting tips, to answer parenting questions from: the tips with these ids " +
      'in full (see the tip list in the instructions), and, for a baby, what is usual at its ' +
      'age: the stage, its tips, milestones and when to see a doctor.',
    inputSchema: z.object({
      ids: z.array(z.string()).max(5).optional().meta({ description: 'Tip ids from the list' }),
      baby: z.string().optional().meta({ description: "A baby's name, for its age's stage" }),
    }),
    outputSchema: z.object({ tips: z.array(z.string()), stage: z.string().optional() }),
  }).server(async ({ ids = [], baby }) => {
    const tips = ids.flatMap((id) => {
      const tip = tipById(id)
      return tip ? [tipText(tip)] : []
    })
    const known = baby ? (await babies()).find((item) => item.name === baby) : undefined
    return known ? { tips, stage: stageText(ageOn(known.birthDate, now, timeZone)) } : { tips }
  })

  const endConversation = toolDefinition({
    name: 'end_conversation',
    description:
      'Call when the user is finished ("没有了", "好了", "谢谢") or nothing more can be done, ' +
      'then say a short goodbye.',
    inputSchema: z.object({}),
    outputSchema: z.object({ ended: z.boolean() }),
  }).server(async () => {
    ctx.state.done = true
    return { ended: true }
  })

  return [listBabies, findEvents, record, updateEvent, deleteEvent, undo, readTips, endConversation]
}
