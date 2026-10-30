import type { BreastSegment, Event } from '@lullabo/shared'
import { z } from 'zod'

import type { Access, FamilyAccess } from '../../access'
import { formatClock } from '../../time-zone'
import { type Change, eventsByIds, writableBabies } from '../data'
import { implausible } from '../guide'
import { type VoiceBaby, describe } from '../plan/plan'

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
    /** A question the turn ends on after what it saved, instead of asking for more. */
    ask?: string
  }
}

/** A turn's context with what its tools share. */
export interface ToolContext extends AgentContext {
  /** The babies the turn may record for, read again on each call. */
  babies: () => Promise<VoiceBaby[]>
  /** Where a change is logged, for undo. */
  log: { threadId: string; runId: string }
  /** A change made: kept for the turn's answer, and told to the model. */
  saved: (message: string) => { ok: boolean; message: string }
  /** One of the family's events, if the user may see it. */
  ownEvent: (id: string) => Promise<{ event: Event; known: VoiceBaby[] } | null>
}

/** The helpers one turn's tools share, bound to its context. */
export function toolContext(ctx: AgentContext): ToolContext {
  const { db, families } = ctx
  const babies = () => writableBabies(db, families)
  const log = { threadId: ctx.threadId, runId: ctx.runId }
  const saved = (message: string) => {
    ctx.state.saved.push(message)
    return { ok: true, message }
  }

  async function ownEvent(id: string) {
    const [event] = await eventsByIds(db, [id])
    const known = await babies()
    return event && event.deletedAt === null && known.some((baby) => baby.id === event.babyId)
      ? { event, known }
      : null
  }

  return { ...ctx, babies, log, saved, ownEvent }
}

export const resultSchema = z.object({ ok: z.boolean(), message: z.string() })

export function line(event: Event, before: Event | null, babies: VoiceBaby[], timeZone: string) {
  const name = babies.find((baby) => baby.id === event.babyId)?.name ?? ''
  const at = before && event.endAt !== null && before.endAt === null ? event.endAt : event.startAt
  return `${name} ${formatClock(at, timeZone)} ${describe(event, before)}`
}

export const confirmedSchema = z
  .boolean()
  .meta({ description: 'True only after the parent confirmed a value that looked misheard' })

/**
 * Breastfeed sides moved with a new start, the last side ending at the new end. A side that
 * would end before it starts is dropped (the feed got shorter than it was).
 */
export function retimed(segments: BreastSegment[], startAt: number, endAt: number | null) {
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
export function doubt(changes: Change[], babies: VoiceBaby[], now: number, timeZone: string) {
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

export const REFUSED: Record<string, string> = {
  forbidden: '没有权限做这个操作。',
  family_mismatch: '这条记录不属于这个家庭。',
}
