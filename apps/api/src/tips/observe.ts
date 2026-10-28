import { type BabyAge, type Event, shiftDay } from '@lullabo/shared'
import { type AnyTextAdapter, chat } from '@tanstack/ai'

import { ageLabel, referenceLine } from '../agent/guide'
import { withoutThinking } from '../agent/text'
import { localDay } from '../time-zone'

/** The week looked at: the last complete days, not today, which is still going. */
export const WEEK = 7
/** With fewer days that have any records, there is nothing to say yet. */
export const MIN_LOGGED_DAYS = 3
/** A day with fewer records than this was most likely not fully logged. */
const SPARSE_DAY = 3
/** Writing waits this long at most. */
const TIMEOUT_MS = 15_000
const MAX_CHARS = 300

const INSTRUCTIONS = `你是一位温和、靠谱的育儿顾问。根据宝宝过去一周的记录，给爸妈写一段简短的观察。

要求：
- 两到三句话，不超过 120 个字，纯文本，不用列表、标题或表情。
- 记录来自爸妈手动记，常常不全：某天记录少，多半是没记，不代表没发生。绝不要从缺少的记录得出结论（比如"这天没喂奶""睡得很少"）。
- 只说几天里都看得出的规律，并和这个月龄的常见情况比一比；拿不准就不说。
- 如果记录太少，温和地说记录不多，只就记了的部分说一两句。
- 语气平和，给一个具体、能做到的小建议。不诊断，不吓人；只有记录里出现明确的危险信号（比如体温 38℃ 及以上）才建议看医生。`

const hours = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10

/**
 * One line per day of the week, oldest first, saying what was logged and how much: what
 * the model reads. Days with few records are marked, so it doesn't read gaps as facts.
 */
export function weekLines(events: readonly Event[], now: number, timeZone: string) {
  const today = localDay(now, timeZone)
  const days = Array.from({ length: WEEK }, (_, i) => shiftDay(today, i - WEEK))
  const byDay = new Map(days.map((day) => [day, [] as Event[]]))
  for (const event of events) {
    if (event.deletedAt === null) byDay.get(localDay(event.startAt, timeZone))?.push(event)
  }
  let logged = 0
  const lines = days.map((day) => {
    const dayEvents = byDay.get(day) ?? []
    if (dayEvents.length === 0) return `${day}：没有记录`
    logged += 1
    let bottles = 0
    let bottleMl = 0
    let breastfeeds = 0
    let breastMs = 0
    let sleepMs = 0
    let diapers = 0
    let dirty = 0
    let maxCelsius = 0
    const foods: string[] = []
    const medicines: string[] = []
    for (const event of dayEvents) {
      if (event.type === 'feeding') {
        if (event.data.kind === 'bottle') {
          bottles += 1
          bottleMl += event.data.amountMl
        } else if (event.data.kind === 'breast') {
          breastfeeds += 1
          for (const segment of event.data.segments) {
            breastMs += Math.max(0, (segment.endAt ?? segment.startAt) - segment.startAt)
          }
        } else foods.push(event.data.food)
      }
      if (event.type === 'sleep' && event.endAt !== null) sleepMs += event.endAt - event.startAt
      if (event.type === 'diaper') {
        diapers += 1
        if (event.data.contents !== 'wet') dirty += 1
      }
      if (event.type === 'temperature') maxCelsius = Math.max(maxCelsius, event.data.celsius)
      if (event.type === 'medication') medicines.push(event.data.name)
    }
    const parts = [
      bottles > 0 ? `瓶喂 ${bottles} 次共 ${bottleMl} 毫升` : '',
      breastfeeds > 0 ? `亲喂 ${breastfeeds} 次共 ${Math.round(breastMs / 60_000)} 分钟` : '',
      foods.length > 0 ? `辅食：${foods.join('、')}` : '',
      sleepMs > 0 ? `记了睡眠 ${hours(sleepMs)} 小时` : '',
      diapers > 0 ? `尿布 ${diapers} 片（便便 ${dirty} 次）` : '',
      maxCelsius > 0 ? `最高体温 ${maxCelsius}℃` : '',
      medicines.length > 0 ? `用药：${medicines.join('、')}` : '',
    ].filter(Boolean)
    const sparse = dayEvents.length < SPARSE_DAY ? '（这天记录很少，可能没记全）' : ''
    return `${day}：共 ${dayEvents.length} 条记录；${parts.join('；')}${sparse}`
  })
  return { lines, logged }
}

/**
 * The AI's observation on the week, written by the family's AI; null when it fails, so the
 * next visit tries again.
 */
export async function observe(
  adapter: AnyTextAdapter,
  modelOptions: Record<string, unknown> | undefined,
  baby: { name: string; age: BabyAge; months: number },
  lines: string[],
): Promise<string | null> {
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), TIMEOUT_MS)
  try {
    const { text } = await chat({
      adapter,
      abortController,
      modelOptions,
      stream: false,
      systemPrompts: [INSTRUCTIONS],
      messages: [
        {
          role: 'user',
          content: [
            `宝宝：${baby.name}，${ageLabel(baby.age)}`,
            `这个月龄的常见情况：${referenceLine(baby.months)}`,
            '过去一周的记录：',
            ...lines,
          ].join('\n'),
        },
      ],
    })
    const written = withoutThinking(text)
      .replaceAll(/[*#>`]/g, '')
      .trim()
    return written ? written.slice(0, MAX_CHARS) : null
  } catch (error) {
    console.error('Writing the observation failed', error)
    return null
  } finally {
    clearTimeout(timer)
  }
}
