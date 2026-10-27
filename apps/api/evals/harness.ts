import { type Event, newId } from '@bobo/shared'
import type { AnyTextAdapter } from '@tanstack/ai'

import { loadAccess } from '../src/access'
import { type AgentScope, FAILED_REPLY, runAgent } from '../src/agent/run'
import { localDay } from '../src/voice/plan'
import type { createTestApp } from '../test/app'
import { baby } from '../test/fixtures'
import type { Category, Expect, RecordMatch, Scenario, Turn } from './scenarios'

type TestApp = Awaited<ReturnType<typeof createTestApp>>

const DAY = 86_400_000
const ZONE = 'Asia/Shanghai'

interface Stored {
  type: string
  data: Record<string, unknown>
}

export interface TurnResult {
  say: string
  reply: string
  added: Stored[]
  pass: boolean
  /** Why the turn failed. */
  why?: string
}

/** Why a turn failed when the model call itself failed (see the run's log for the error). */
export const ERRORED = '模型调用出错'

export interface RunResult {
  scenario: Scenario
  model: string
  turns: TurnResult[]
  pass: boolean
  error?: string
}

function matches(stored: Stored, match: RecordMatch): boolean {
  if (stored.type !== match.type) return false
  return Object.entries(match.data ?? {}).every(([key, value]) => stored.data[key] === value)
}

/**
 * Whether the reply asks the parent something. The usual "还有吗？" at the end of every reply
 * does not count.
 */
export function asksQuestion(reply: string): boolean {
  const rest = reply.replaceAll(/还有(别的|其他|什么)?(要记的)?(吗|么)[？?]?/g, '')
  return /[？?]|吗|么/.test(rest)
}

/** English words in a reply, besides names said in Chinese too (Siri, Lullabo) and units. */
export const speaksEnglish = (reply: string) =>
  /[A-Za-z]{3,}/.test(reply.replaceAll(/\b(Siri|Lullabo|AI)\b/g, ''))

/** Whether a turn did what was expected, from its reply and the records it added. */
export function judge(
  expect: Expect,
  reply: string,
  added: Stored[],
): { pass: boolean; why?: string } {
  // Siri reads replies aloud in Chinese; English words are usually the model's notes to
  // itself ("Need update latest diaper…") leaking into the reply.
  if (speaksEnglish(reply)) return { pass: false, why: '回复夹带英文' }
  if ('asks' in expect) {
    const forbidden = expect.forbid
      ? added.filter((stored) => matches(stored, expect.forbid!))
      : added
    if (forbidden.length > 0) return { pass: false, why: '没有先问就记了' }
    if (!asksQuestion(reply)) return { pass: false, why: '没有记，但也没有问' }
    return { pass: true }
  }
  if (added.some((stored) => matches(stored, expect.records))) return { pass: true }
  if (added.length === 0 && asksQuestion(reply)) return { pass: false, why: '不该问却问了' }
  return { pass: false, why: '记的内容不对' }
}

/** Last week's bottle feeds around the usual amount, the latest two hours ago. */
function history(babyId: string, familyId: string, scenario: Scenario, now: number): Event[] {
  if (!scenario.history) return []
  const { bottleMl, perDay } = scenario.history
  const gap = DAY / perDay
  const wobble = [0, -0.1, 0.1, -0.05, 0.05]
  return Array.from({ length: perDay * 7 }, (_, index): Event => {
    const at = now - 2 * 3_600_000 - index * gap
    return {
      id: newId(at),
      babyId,
      familyId,
      type: 'feeding',
      startAt: at,
      endAt: null,
      note: null,
      data: {
        kind: 'bottle',
        amountMl: Math.round(bottleMl * (1 + (wobble[index % wobble.length] ?? 0))),
        milk: 'formula',
      },
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      createdBy: null,
    }
  })
}

async function storedEvents(t: TestApp, familyId: string): Promise<Map<string, Stored>> {
  const { results } = await t.env.DB.prepare(
    'select id, type, data from events where family_id = ? and deleted_at is null',
  )
    .bind(familyId)
    .all<{ id: string; type: string; data: string }>()
  return new Map(
    results.map((row) => {
      const data: unknown = JSON.parse(row.data)
      const fields = typeof data === 'object' && data !== null ? Object.entries(data) : []
      return [row.id, { type: row.type, data: Object.fromEntries(fields) }]
    }),
  )
}

async function playTurn(
  t: TestApp,
  adapter: AnyTextAdapter,
  scope: AgentScope,
  familyId: string,
  turn: Turn,
): Promise<TurnResult> {
  const before = await storedEvents(t, familyId)
  const { reply } = await runAgent(adapter, scope, turn.say, Date.now())
  const after = await storedEvents(t, familyId)
  const added = [...after].filter(([id]) => !before.has(id)).map(([, stored]) => stored)
  // A failed model call says nothing about the model's judgement: counted apart.
  if (reply === FAILED_REPLY) return { say: turn.say, reply, added, pass: false, why: ERRORED }
  return { say: turn.say, reply, added, ...judge(turn.expect, reply, added) }
}

/** Plays one scenario against a model, as a new parent with one baby. */
export async function runScenario(
  t: TestApp,
  adapter: AnyTextAdapter,
  model: string,
  scenario: Scenario,
  modelOptions?: Record<string, unknown>,
): Promise<RunResult> {
  const { user, headers } = await t.signIn()
  const created = await t.send('POST', '/api/families', headers, { name: '我们家' })
  const family: { id: string } = await created.json()
  const now = Date.now()
  const birthDate = localDay(now - scenario.ageDays * DAY, ZONE)
  const child = baby(family.id, { name: '小米粒', birthDate })
  await t.send('POST', '/api/sync/push', headers, {
    babies: [child],
    events: history(child.id, family.id, scenario, now),
  })
  const access = await loadAccess(t.env.DB, user.id)
  const scope: AgentScope = {
    db: t.env.DB,
    access,
    families: [access.get(family.id)!],
    sharedOnly: false,
    keyScope: 'own',
    userId: user.id,
    timeZone: ZONE,
    locale: 'zh-CN',
    phrase: '记录宝宝',
    modelOptions,
  }

  const turns: TurnResult[] = []
  try {
    for (const turn of scenario.turns) {
      // oxlint-disable-next-line no-await-in-loop -- each turn follows the previous one
      const result = await playTurn(t, adapter, scope, family.id, turn)
      turns.push(result)
      if (!result.pass) break
    }
  } catch (error) {
    return { scenario, model, turns, pass: false, error: String(error) }
  }
  const pass = turns.length === scenario.turns.length && turns.every((turn) => turn.pass)
  return { scenario, model, turns, pass }
}

/** Runs tasks a few at a time. */
export async function pool<T>(tasks: Array<() => Promise<T>>, size: number): Promise<T[]> {
  const results: T[] = []
  // One iterator shared by the workers: each takes the next task when it is free.
  const queue = tasks.entries()
  async function worker() {
    for (const [index, task] of queue) {
      // oxlint-disable-next-line no-await-in-loop -- a worker takes tasks one at a time
      results[index] = await task()
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker))
  return results
}

const CATEGORY_LABEL: Record<Category, string> = {
  misheard: '疑似听错 → 先问',
  plausible: '合理 → 直接记',
  'follow-up': '问了之后按回答记',
}

const percent = (passed: number, total: number) =>
  total === 0 ? '–' : `${Math.round((passed / total) * 100)}%（${passed}/${total}）`

/** The results as Markdown: pass rates by model and category, then every failure. */
const errored = (result: RunResult) =>
  result.error !== undefined || result.turns.some((turn) => turn.why === ERRORED)

/**
 * The results as Markdown: pass rates by model and category, then every failure. Runs whose
 * model call failed are counted apart, not as wrong answers.
 */
export function report(results: RunResult[], runs: number): string {
  const models = [...new Set(results.map((result) => result.model))]
  const categories: Category[] = ['misheard', 'plausible', 'follow-up']
  const lines = [
    `# Agent evals`,
    '',
    `每个场景跑 ${runs} 次。通过率不算调用出错的那几次。`,
    '',
    `| 模型 | ${categories.map((category) => CATEGORY_LABEL[category]).join(' | ')} | 总计 | 调用出错 |`,
    `| --- | ${categories.map(() => '---').join(' | ')} | --- | --- |`,
  ]
  for (const model of models) {
    const mine = results.filter((result) => result.model === model)
    const judged = mine.filter((result) => !errored(result))
    const rate = (some: RunResult[]) =>
      percent(some.filter((result) => result.pass).length, some.length)
    const cells = categories.map((category) =>
      rate(judged.filter((result) => result.scenario.category === category)),
    )
    lines.push(
      `| ${model} | ${cells.join(' | ')} | ${rate(judged)} | ${mine.length - judged.length} |`,
    )
  }
  const failures = results.filter((result) => !result.pass && !errored(result))
  if (failures.length > 0) {
    lines.push('', '## 没通过的', '')
    for (const failure of failures) {
      const last = failure.turns.at(-1)
      const said = last ? `「${last.say}」→「${last.reply}」` : ''
      const added = last && last.added.length > 0 ? `，记了 ${JSON.stringify(last.added)}` : ''
      lines.push(
        `- **${failure.model}** · ${failure.scenario.name}：${last?.why ?? ''}。${said}${added}`,
      )
    }
  }
  const errors = results.filter(errored)
  if (errors.length > 0) {
    lines.push('', '## 调用出错', '')
    for (const model of models) {
      const count = errors.filter((result) => result.model === model).length
      if (count > 0) lines.push(`- **${model}**：${count} 次，错误信息在运行日志里。`)
    }
  }
  return `${lines.join('\n')}\n`
}
