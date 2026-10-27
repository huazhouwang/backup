import {
  type Event,
  eventSchema,
  hasKnownDuration,
  isRunning,
  newId,
  recordKind,
  sleepKindFor,
} from '@lullabo/shared'

import { TIMED_TYPES, type TimedType, type VoiceAction } from './action'

const MINUTE = 60_000

export interface VoiceBaby {
  id: string
  name: string
  familyId: string
  /** "YYYY-MM-DD", for the age the assistant checks values against. */
  birthDate: string
}

export interface PlanContext {
  /** Babies the user may add records for. */
  babies: VoiceBaby[]
  /** The babies' running timers, to stop them ("醒了", "喂完了") and not start one twice. */
  running: readonly Event[]
  userId: string
  now: number
  timeZone: string
}

/** One record to write; `before` is the stored version it replaces, or null when added. */
export interface PlannedChange {
  event: Event
  before: Event | null
}

export type Plan =
  | { kind: 'changes'; changes: PlannedChange[]; lines: string[] }
  | { kind: 'undo' }
  | { kind: 'reply'; reply: string }

export const REPLY = {
  unclear: '没听懂，可以再说一遍吗？比如「小米粒换尿布了」。',
  noBabies: '还没有可以记录的宝宝。',
  whichBaby: '是哪个宝宝？请带上名字（重名时带上家庭）再说一遍。',
  unknownBaby: (name: string) => `没有叫「${name}」的宝宝。`,
  needAmount: '是多少毫升？请带上量再说一遍。',
  needTemperature: '体温是多少度？请再说一遍。',
  needMedicine: '吃的是什么药？请再说一遍。',
  needGrowth: '体重、身长或头围是多少？请再说一遍。',
  splitMismatch: '母乳和奶粉加起来和总量对不上，请再说一遍。',
  notRunning: (name: string, what: string | null) =>
    what ? `${name}现在没有在${what}。` : `${name}现在没有在计时的记录。`,
  whichTimer: (name: string) => `${name}有好几个在计时，是哪个结束了？`,
  alreadyRunning: (name: string, what: string) => `${name}已经在${what}了。`,
  endBeforeStart: (name: string, what: string) => `${name}这次${what}开始得比这个时间晚。`,
}

/** A timer's kind as said in a reply: "小米粒已经在睡觉了". */
const TIMED_LABEL: Record<TimedType, string> = {
  breast: '亲喂',
  bottle: '瓶喂',
  solids: '吃辅食',
  sleep: '睡觉',
  pumping: '吸奶',
}

class Refusal extends Error {}
const refuse = (reply: string): never => {
  throw new Refusal(reply)
}

// Clock times are said in the user's own zone; the server works in UTC.

function zoneParts(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** The zone's offset from UTC at `at`, in ms. */
function zoneOffset(at: number, timeZone: string): number {
  const p = zoneParts(at, timeZone)
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000
  )
}

/** "HH:MM" today in the zone, or yesterday if that is still ahead of now. */
export function clockToTime(clock: string, now: number, timeZone: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  const today = zoneParts(now, timeZone)
  const local = Date.UTC(today.year, today.month - 1, today.day, hour, minute)
  const at = local - zoneOffset(now, timeZone)
  // A few minutes of slack for clocks said slightly ahead ("10:30" at 10:28).
  return at > now + 5 * MINUTE ? at - 24 * 60 * MINUTE : at
}

export function formatClock(at: number, timeZone: string): string {
  const p = zoneParts(at, timeZone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Minutes since the zone's midnight, for reading a baby's day on its own clock. */
export function minuteOfDayIn(timeZone: string): (at: number) => number {
  return (at) => {
    const p = zoneParts(at, timeZone)
    return p.hour * 60 + p.minute
  }
}

/** The zone's calendar day at `at`, "YYYY-MM-DD". */
export function localDay(at: number, timeZone: string): string {
  const p = zoneParts(at, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** "2026-10-17 21:05 星期五", for the model to resolve times against. */
export function localNow(now: number, timeZone: string): string {
  const p = zoneParts(now, timeZone)
  const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone, weekday: 'long' }).format(now)
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)} ${weekday}`
}

const DIAPER = { wet: '尿尿', dirty: '便便', mixed: '尿便' } as const
const MILK = { breast: '母乳', formula: '配方奶', mixed: '混合' } as const
const SIDE = { left: '左侧', right: '右侧', both: '双侧' } as const

const minutesOf = (ms: number) => Math.max(1, Math.round(ms / MINUTE))

export function durationLabel(ms: number): string {
  const minutes = minutesOf(ms)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${minutes} 分钟`
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`
}

/** What a record is, in a few words: "换尿布（尿尿）". */
export function describe(event: Event, before: Event | null): string {
  const prefix = isRunning(event) && event.type !== 'sleep' ? '正在' : ''
  const said = prefix + describeRecord(event, before)
  // Breastfeeds and sleeps say how long in their own words; the others add it.
  const kind = recordKind(event)
  if (kind === 'breast' || kind === 'sleep' || !hasKnownDuration(event)) return said
  return `${said}，用了 ${durationLabel((event.endAt ?? 0) - event.startAt)}`
}

function describeRecord(event: Event, before: Event | null): string {
  switch (event.type) {
    case 'diaper':
      return `换尿布（${DIAPER[event.data.contents]}）`
    case 'feeding': {
      const { data } = event
      if (data.kind === 'bottle') {
        const milk =
          data.breastMl !== undefined && data.formulaMl !== undefined
            ? `母乳 ${data.breastMl} + 配方奶 ${data.formulaMl}`
            : MILK[data.milk]
        return `瓶喂 ${data.amountMl} 毫升（${milk}）`
      }
      if (data.kind === 'solids') return `辅食：${data.food}`
      if (event.endAt === null) return `亲喂（${SIDE[data.segments.at(-1)?.side ?? 'left']}）`
      const total = `亲喂 ${durationLabel(event.endAt - event.startAt)}`
      const sides = data.segments
        .filter((segment) => segment.endAt !== null && segment.endAt > segment.startAt)
        .map(
          (segment) =>
            `${segment.side === 'left' ? '左' : '右'} ${minutesOf((segment.endAt ?? 0) - segment.startAt)}`,
        )
      return sides.length > 1 ? `${total}（${sides.join(' + ')}）` : total
    }
    case 'sleep':
      if (event.endAt === null) return '开始睡觉'
      return before
        ? `醒了（睡了 ${durationLabel(event.endAt - event.startAt)}）`
        : `睡了 ${durationLabel(event.endAt - event.startAt)}`
    case 'pumping':
      return event.data.amountMl === undefined
        ? `吸奶（${SIDE[event.data.side]}）`
        : `吸奶 ${event.data.amountMl} 毫升（${SIDE[event.data.side]}）`
    case 'temperature':
      return `体温 ${event.data.celsius}°C`
    case 'medication':
      return `用药：${event.data.name}${event.data.dose ? ` ${event.data.dose}` : ''}`
    case 'note':
      return `笔记：${event.note ?? ''}`
    case 'growth': {
      const { weightKg, lengthCm, headCm } = event.data
      const parts = [
        weightKg !== null && `体重 ${weightKg} 公斤`,
        lengthCm !== null && `身长 ${lengthCm} 厘米`,
        headCm !== null && `头围 ${headCm} 厘米`,
      ].filter(Boolean)
      return `生长记录：${parts.join('，')}`
    }
    default:
      return event satisfies never
  }
}

function pickBaby(action: VoiceAction, babies: VoiceBaby[]): VoiceBaby {
  if (babies.length === 0) refuse(REPLY.noBabies)
  const said = action.baby?.trim()
  if (!said) return babies.length === 1 && babies[0] ? babies[0] : refuse(REPLY.whichBaby)
  const exact = babies.find((baby) => baby.name === said)
  if (exact) return exact
  const close = babies.filter((baby) => said.includes(baby.name) || baby.name.includes(said))
  // Two babies of that name in different families.
  if (close.length > 1) refuse(REPLY.whichBaby)
  return close[0] ?? refuse(REPLY.unknownBaby(said))
}

/** When it happened: a clock time, "N minutes ago", or now. Never in the future. */
function whenOf(action: VoiceAction, context: PlanContext): number {
  const { now, timeZone } = context
  const clock = action.time ? clockToTime(action.time, now, timeZone) : null
  const at =
    clock ?? (action.minutesAgo !== null ? now - Math.max(0, action.minutesAgo) * MINUTE : now)
  return Math.min(at, now)
}

function draft(baby: VoiceBaby, context: PlanContext, startAt: number, endAt: number | null) {
  const { now, userId } = context
  return {
    id: newId(now),
    babyId: baby.id,
    familyId: baby.familyId,
    startAt,
    endAt,
    note: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: userId,
  }
}

/** A record, validated like a synced one. */
function checked(event: unknown, before: Event | null): PlannedChange {
  const parsed = eventSchema.safeParse(event)
  return parsed.success ? { event: parsed.data, before } : refuse(REPLY.unclear)
}

const added = (event: unknown) => checked(event, null)

const positive = (value: number | null): value is number => value !== null && value > 0
const ml = (value: number) => Math.round(value)

/**
 * A bottle's amount and milk. Both parts said ("母乳 60 奶粉 60") make it mixed with that
 * split, the total their sum; one part and the total give the other part.
 */
type BottleFields = Pick<VoiceAction, 'amountMl' | 'milk' | 'breastMl' | 'formulaMl'>
type Milk = 'breast' | 'formula' | 'mixed'

function bottleData(action: BottleFields, fallbackMilk: Milk) {
  const { breastMl, formulaMl } = action
  // The total, or the parts said, or just the one part said.
  const parts = (breastMl ?? 0) + (formulaMl ?? 0)
  const total = positive(action.amountMl)
    ? ml(action.amountMl)
    : parts > 0
      ? ml(parts)
      : refuse(REPLY.needAmount)
  const breast =
    breastMl !== null ? ml(breastMl) : formulaMl !== null ? total - ml(formulaMl) : null
  const formula = formulaMl !== null ? ml(formulaMl) : breast !== null ? total - breast : null
  if (breast === null || formula === null) {
    return { kind: 'bottle', amountMl: total, milk: action.milk ?? fallbackMilk }
  }
  if (breast < 0 || formula < 0 || breast + formula !== total) refuse(REPLY.splitMismatch)
  // A "split" with nothing on one side is just that milk.
  if (formula === 0) return { kind: 'bottle', amountMl: total, milk: 'breast' }
  if (breast === 0) return { kind: 'bottle', amountMl: total, milk: 'formula' }
  return { kind: 'bottle', amountMl: total, milk: 'mixed', breastMl: breast, formulaMl: formula }
}

/**
 * A stored bottle with the fields said changed, or why not. Both parts said set the total;
 * otherwise the total stays unless said.
 */
export function editedBottle(
  fields: BottleFields,
  current: { amountMl: number; milk: Milk },
): { data: ReturnType<typeof bottleData> } | { reply: string } {
  const split = fields.breastMl !== null && fields.formulaMl !== null
  try {
    const amountMl = fields.amountMl ?? (split ? null : current.amountMl)
    return { data: bottleData({ ...fields, amountMl }, current.milk) }
  } catch (error) {
    if (error instanceof Refusal) return { reply: error.message }
    throw error
  }
}

/** A finished breastfeed from minutes per side, the side said first fed first. */
function breastBySides(action: VoiceAction, baby: VoiceBaby, context: PlanContext) {
  const first = action.side === 'right' ? 'right' : 'left'
  const order = first === 'left' ? (['left', 'right'] as const) : (['right', 'left'] as const)
  const sides = order
    .map((side) => ({
      side,
      ms: Math.max(0, (side === 'left' ? action.leftMinutes : action.rightMinutes) ?? 0) * MINUTE,
    }))
    .filter(({ ms }) => ms > 0)
  const total = sides.reduce((sum, { ms }) => sum + ms, 0)
  const startAt = Math.min(whenOf(action, context), context.now - total)
  let at = startAt
  const segments = sides.map(({ side, ms }) => {
    const segment = { side, startAt: at, endAt: at + ms }
    at += ms
    return segment
  })
  return added({
    ...draft(baby, context, startAt, startAt + total),
    type: 'feeding',
    data: { kind: 'breast', segments },
  })
}

/** Running timers of `baby`, of the kind said or all. */
const runningOf = (context: PlanContext, babyId: string, kind: TimedType | null) =>
  context.running.filter(
    (event) => event.babyId === babyId && (kind === null || recordKind(event) === kind),
  )

/** "喂完了": the running timer ends at the time said, or now. */
function stop(action: VoiceAction, context: PlanContext): PlannedChange {
  const kind = action.stops
  // No baby said with several: the one whose timer this can be.
  const timing = context.babies.filter((baby) => runningOf(context, baby.id, kind).length > 0)
  const baby =
    !action.baby?.trim() && context.babies.length > 1 && timing.length === 1 && timing[0]
      ? timing[0]
      : pickBaby(action, context.babies)
  const candidates = runningOf(context, baby.id, kind)
  if (candidates.length > 1) refuse(REPLY.whichTimer(baby.name))
  const running = candidates[0] ?? refuse(REPLY.notRunning(baby.name, kind && TIMED_LABEL[kind]))
  // Only duration records run; sleep is just the fallback the types need.
  const runningKind = TIMED_TYPES.find((type) => type === recordKind(running)) ?? 'sleep'
  const endAt = whenOf(action, context)
  const open =
    running.type === 'feeding' && running.data.kind === 'breast'
      ? (running.data.segments.at(-1)?.startAt ?? running.startAt)
      : running.startAt
  if (endAt < open) refuse(REPLY.endBeforeStart(baby.name, TIMED_LABEL[runningKind]))

  const event: Record<string, unknown> = { ...running, endAt, updatedAt: context.now }
  if (running.type === 'feeding') {
    const { data } = running
    if (data.kind === 'breast') {
      event.data = {
        ...data,
        segments: data.segments.map((segment) =>
          segment.endAt === null ? { ...segment, endAt } : segment,
        ),
      }
    } else if (data.kind === 'bottle') {
      // An amount said now replaces the one said at the start.
      const said =
        positive(action.amountMl) || action.breastMl !== null || action.formulaMl !== null
      if (said) event.data = bottleData(action, data.milk)
    } else if (action.food?.trim()) {
      event.data = { ...data, food: action.food.trim() }
    }
  }
  if (running.type === 'pumping') {
    const amountMl = positive(action.amountMl)
      ? ml(action.amountMl)
      : (running.data.amountMl ?? refuse(REPLY.needAmount))
    event.data = { side: action.side ?? running.data.side, amountMl }
  }
  return checked(event, running)
}

function changeFor(action: VoiceAction, context: PlanContext): PlannedChange {
  if (action.type === 'stop') return stop(action, context)
  const baby = pickBaby(action, context.babies)
  const at = whenOf(action, context)
  const minutes = positive(action.durationMinutes)
  const duration = minutes ? (action.durationMinutes ?? 0) * MINUTE : 0
  // A timer runs from the time said: asked for, or a feed or sleep said without how long.
  const timed = (kind: TimedType, bySides = false) => {
    const starts =
      !minutes && !bySides && (action.timer === true || kind === 'breast' || kind === 'sleep')
    if (starts && runningOf(context, baby.id, kind).length > 0) {
      refuse(REPLY.alreadyRunning(baby.name, TIMED_LABEL[kind]))
    }
    return starts
  }
  // A finished record: with a duration said, one that ended by now; without, the end is the
  // start (how long it took wasn't said).
  const done = () => {
    const startAt = minutes ? Math.min(at, context.now - duration) : at
    return draft(baby, context, startAt, startAt + duration)
  }
  const record = (kind: TimedType) => (timed(kind) ? draft(baby, context, at, null) : done())

  switch (action.type) {
    case 'diaper': {
      const contents = action.diaper ?? 'wet'
      const pee = contents === 'dirty' ? {} : { pee: { amount: 'normal' } }
      return added({
        ...draft(baby, context, at, null),
        type: 'diaper',
        data: { contents, ...pee },
      })
    }
    case 'bottle':
      return added({ ...record('bottle'), type: 'feeding', data: bottleData(action, 'formula') })
    case 'breast': {
      const side = action.side === 'right' ? 'right' : 'left'
      const bySides = positive(action.leftMinutes) || positive(action.rightMinutes)
      if (timed('breast', bySides)) {
        const segments = [{ side, startAt: at, endAt: null }]
        return added({
          ...draft(baby, context, at, null),
          type: 'feeding',
          data: { kind: 'breast', segments },
        })
      }
      if (bySides) return breastBySides(action, baby, context)
      // A finished feed that ended by now; "两边各…" splits it evenly, left first.
      const { startAt, endAt } = done()
      const half = startAt + Math.round(duration / 2)
      const segments =
        action.side === 'both'
          ? [
              { side: 'left', startAt, endAt: half },
              { side: 'right', startAt: half, endAt },
            ]
          : [{ side, startAt, endAt }]
      return added({
        ...draft(baby, context, startAt, endAt),
        type: 'feeding',
        data: { kind: 'breast', segments },
      })
    }
    case 'solids':
      return added({
        ...record('solids'),
        type: 'feeding',
        data: { kind: 'solids', food: action.food?.trim() || '辅食' },
      })
    case 'sleep': {
      const sleep = record('sleep')
      const kind = sleepKindFor(sleep.startAt, minuteOfDayIn(context.timeZone))
      return added({ ...sleep, type: 'sleep', data: { kind } })
    }
    case 'pumping': {
      const running = timed('pumping')
      // The amount is known once pumping is done.
      if (!running && !positive(action.amountMl)) refuse(REPLY.needAmount)
      const amount = positive(action.amountMl) ? { amountMl: ml(action.amountMl) } : {}
      return added({
        ...(running ? draft(baby, context, at, null) : done()),
        type: 'pumping',
        data: { side: action.side ?? 'both', ...amount },
      })
    }
    case 'temperature': {
      if (action.celsius === null) refuse(REPLY.needTemperature)
      const celsius = Math.round((action.celsius ?? 0) * 10) / 10
      return added({ ...draft(baby, context, at, null), type: 'temperature', data: { celsius } })
    }
    case 'medication': {
      const name = action.medicine?.trim() || refuse(REPLY.needMedicine)
      const data = { name, dose: action.dose?.trim() || null }
      return added({ ...draft(baby, context, at, null), type: 'medication', data })
    }
    case 'growth': {
      const round = (value: number | null, places: number) =>
        positive(value) ? Math.round(value * 10 ** places) / 10 ** places : null
      const data = {
        weightKg: round(action.weightKg, 2),
        lengthCm: round(action.lengthCm, 1),
        headCm: round(action.headCm, 1),
      }
      if (data.weightKg === null && data.lengthCm === null && data.headCm === null) {
        refuse(REPLY.needGrowth)
      }
      return added({ ...draft(baby, context, at, null), type: 'growth', data })
    }
    case 'note': {
      const note = action.text?.trim() || refuse(REPLY.unclear)
      return added({ ...draft(baby, context, at, null), note, type: 'note', data: {} })
    }
    default:
      // undo is handled before any record is built.
      return refuse(REPLY.unclear)
  }
}

/** Turns parsed actions into checked records, or the reply that explains why not. */
export function planActions(actions: VoiceAction[], context: PlanContext): Plan {
  if (actions.some((action) => action.type === 'undo')) return { kind: 'undo' }
  if (actions.length === 0) return { kind: 'reply', reply: REPLY.unclear }
  try {
    const changes = actions.map((action) => changeFor(action, context))
    const names = new Map(context.babies.map((baby) => [baby.id, baby.name]))
    const lines = changes.map(
      ({ event, before }) =>
        `${names.get(event.babyId) ?? ''} ${formatClock(event.endAt !== null && before ? event.endAt : event.startAt, context.timeZone)} ${describe(event, before)}`,
    )
    return { kind: 'changes', changes, lines }
  } catch (error) {
    if (error instanceof Refusal) return { kind: 'reply', reply: error.message }
    throw error
  }
}
