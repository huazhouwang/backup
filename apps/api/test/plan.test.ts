import { type Event, newId } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import type { VoiceAction } from '../src/voice/action'
import { type PlanContext, type PlannedChange, editedBottle, planActions } from '../src/voice/plan'

const MINUTE = 60_000
const NOW = Date.UTC(2026, 9, 17, 2, 0)

const action = (overrides: Partial<VoiceAction>): VoiceAction => ({
  type: 'diaper',
  baby: null,
  time: null,
  minutesAgo: null,
  durationMinutes: null,
  timer: null,
  stops: null,
  diaper: null,
  amountMl: null,
  milk: null,
  breastMl: null,
  formulaMl: null,
  side: null,
  leftMinutes: null,
  rightMinutes: null,
  food: null,
  celsius: null,
  medicine: null,
  dose: null,
  weightKg: null,
  lengthCm: null,
  headCm: null,
  text: null,
  ...overrides,
})

const FAMILY = newId(NOW)
const MILI = newId(NOW)
const babies = [
  { id: MILI, name: '小米粒', familyId: FAMILY, birthDate: '2026-06-01' },
  { id: newId(NOW), name: '小豆子', familyId: FAMILY, birthDate: '2026-06-01' },
]

const context = (running: Event[] = [], only = false): PlanContext => ({
  babies: only ? babies.slice(0, 1) : babies,
  running,
  userId: 'u1',
  now: NOW,
  timeZone: 'Asia/Shanghai',
})

/** The one change planned, failing with the reply when refused. */
function planned(
  actions: VoiceAction[],
  ctx = context([], true),
): PlannedChange & {
  line: string
} {
  const plan = planActions(actions, ctx)
  if (plan.kind !== 'changes') throw new Error(plan.kind === 'reply' ? plan.reply : plan.kind)
  const [change] = plan.changes
  if (!change) throw new Error('no change')
  return { ...change, line: plan.lines[0] ?? '' }
}

const replyTo = (actions: VoiceAction[], ctx = context([], true)) => {
  const plan = planActions(actions, ctx)
  return plan.kind === 'reply' ? plan.reply : null
}

const base = { babyId: MILI, familyId: FAMILY, note: null, deletedAt: null, createdBy: 'u1' }
const runningEvent = (event: Record<string, unknown>) =>
  ({ ...base, id: newId(NOW), createdAt: NOW, updatedAt: NOW, endAt: null, ...event }) as Event

describe('planning what was said', () => {
  it('keeps the breast milk and formula of a mixed bottle', () => {
    const { event, line } = planned([action({ type: 'bottle', breastMl: 60, formulaMl: 40 })])
    expect(event.data).toEqual({
      kind: 'bottle',
      amountMl: 100,
      milk: 'mixed',
      breastMl: 60,
      formulaMl: 40,
    })
    expect(line).toContain('瓶喂 100 毫升（母乳 60 + 配方奶 40）')
  })

  it('works out the other part from the total, and refuses parts that do not add up', () => {
    const { event } = planned([
      action({ type: 'bottle', amountMl: 120, milk: 'mixed', breastMl: 50 }),
    ])
    expect(event.data).toMatchObject({ breastMl: 50, formulaMl: 70 })
    expect(
      replyTo([action({ type: 'bottle', amountMl: 120, breastMl: 50, formulaMl: 50 })]),
    ).toMatch(/对不上/)
  })

  it('records minutes per breast, the side said first fed first', () => {
    const { event, line } = planned([
      action({ type: 'breast', side: 'right', leftMinutes: 10, rightMinutes: 15 }),
    ])
    if (event.type !== 'feeding' || event.data.kind !== 'breast') throw new Error('not breast')
    expect(event.data.segments.map((segment) => segment.side)).toEqual(['right', 'left'])
    expect(event.endAt).toBe(NOW)
    expect(event.startAt).toBe(NOW - 25 * MINUTE)
    expect(line).toContain('亲喂 25 分钟（右 15 + 左 10）')
  })

  it('starts timers for bottles, solids and pumping when asked', () => {
    for (const type of ['bottle', 'solids', 'pumping'] as const) {
      const { event, line } = planned([action({ type, timer: true, amountMl: 90 })])
      expect(event.endAt).toBeNull()
      expect(line).toContain('正在')
    }
    // Pumping is started before its amount is known.
    expect(planned([action({ type: 'pumping', timer: true })]).event.data).toEqual({
      side: 'both',
    })
  })

  it('does not start a second timer of the same kind', () => {
    const sleeping = runningEvent({
      type: 'sleep',
      startAt: NOW - 30 * MINUTE,
      data: { kind: 'nap' },
    })
    expect(replyTo([action({ type: 'sleep' })], context([sleeping], true))).toBe(
      '小米粒已经在睡觉了。',
    )
  })

  it('stops the running timer, whichever kind it is', () => {
    const pumping = runningEvent({
      type: 'pumping',
      startAt: NOW - 20 * MINUTE,
      data: { side: 'both' },
    })
    expect(replyTo([action({ type: 'stop' })], context([pumping], true))).toMatch(/多少毫升/)
    const { event, before, line } = planned(
      [action({ type: 'stop', amountMl: 110 })],
      context([pumping], true),
    )
    expect(before?.id).toBe(pumping.id)
    expect(event).toMatchObject({
      id: pumping.id,
      endAt: NOW,
      data: { side: 'both', amountMl: 110 },
    })
    expect(line).toContain('吸奶 110 毫升（双侧），用了 20 分钟')
  })

  it('closes the open side of a breastfeed when it stops', () => {
    const start = NOW - 12 * MINUTE
    const feeding = runningEvent({
      type: 'feeding',
      startAt: start,
      data: { kind: 'breast', segments: [{ side: 'left', startAt: start, endAt: null }] },
    })
    const { event } = planned([action({ type: 'stop', stops: 'breast' })], context([feeding], true))
    expect(event).toMatchObject({
      endAt: NOW,
      data: { segments: [{ side: 'left', startAt: start, endAt: NOW }] },
    })
  })

  it('asks which timer when several run, and finds the baby whose timer it is', () => {
    const sleeping = runningEvent({
      type: 'sleep',
      startAt: NOW - 30 * MINUTE,
      data: { kind: 'nap' },
    })
    const bottle = runningEvent({
      type: 'feeding',
      startAt: NOW - 5 * MINUTE,
      data: { kind: 'bottle', amountMl: 90, milk: 'formula' },
    })
    expect(replyTo([action({ type: 'stop' })], context([sleeping, bottle], true))).toMatch(/哪个/)
    // Two babies, none named: the one asleep is the one who woke.
    const { event, line } = planned(
      [action({ type: 'stop', stops: 'sleep' })],
      context([sleeping, bottle]),
    )
    expect(event.id).toBe(sleeping.id)
    expect(line).toContain('醒了（睡了 30 分钟）')
    expect(replyTo([action({ type: 'stop', stops: 'pumping' })], context([sleeping], true))).toBe(
      '小米粒现在没有在吸奶。',
    )
  })

  it('labels a sleep night or nap by when it started, in the family’s zone', () => {
    // 10:00 in Shanghai now; 23:00 was last night.
    expect(
      planned([action({ type: 'sleep', time: '23:00', durationMinutes: 360 })]).event.data,
    ).toEqual({
      kind: 'night',
    })
    expect(planned([action({ type: 'sleep', durationMinutes: 40 })]).event.data).toEqual({
      kind: 'nap',
    })
  })

  it('records growth, and needs a measurement', () => {
    const { event, line } = planned([action({ type: 'growth', weightKg: 6.234, headCm: 40 })])
    expect(event.data).toEqual({ weightKg: 6.23, lengthCm: null, headCm: 40 })
    expect(line).toContain('生长记录：体重 6.23 公斤，头围 40 厘米')
    expect(replyTo([action({ type: 'growth' })])).toMatch(/体重/)
  })
})

describe('editing a bottle', () => {
  const fields = { amountMl: null, milk: null, breastMl: null, formulaMl: null }

  it('sets a split, its total from both parts', () => {
    expect(
      editedBottle({ ...fields, breastMl: 60, formulaMl: 60 }, { amountMl: 100, milk: 'formula' }),
    ).toEqual({
      data: { kind: 'bottle', amountMl: 120, milk: 'mixed', breastMl: 60, formulaMl: 60 },
    })
  })

  it('keeps the total when one part is said', () => {
    expect(editedBottle({ ...fields, breastMl: 30 }, { amountMl: 100, milk: 'mixed' })).toEqual({
      data: { kind: 'bottle', amountMl: 100, milk: 'mixed', breastMl: 30, formulaMl: 70 },
    })
  })
})
