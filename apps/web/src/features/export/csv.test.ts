import { newId } from '@lullabo/shared'
import { describe, expect, it } from 'vitest'

import { deleteEvent, logBottle, logGrowth, logNote, logSleep } from '../events/records'
import { csvField, csvFileName, eventsToCsv } from './csv'

const BABY = newId()
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()

describe('csvField', () => {
  it('quotes separators and neutralises formulas', () => {
    expect(csvField('简单')).toBe('简单')
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('说 "好"')).toBe('"说 ""好"""')
    expect(csvField('两\n行')).toBe('"两\n行"')
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvField('-1')).toBe("'-1")
    expect(csvField(-1)).toBe('-1')
    expect(csvField(null)).toBe('')
  })
})

describe('eventsToCsv', () => {
  it("names each row's baby when exporting several", () => {
    const other = newId()
    const events = [logBottle(BABY, at(13, 9), 120, 'formula'), logNote(other, at(13, 8), '翻身')]
    const babies = [
      { id: BABY, name: '老大' },
      { id: other, name: '老二' },
    ]
    const lines = eventsToCsv(babies, events, at(13, 0), at(14, 0), at(14, 0)).trim().split('\r\n')
    expect(lines.slice(1).map((line) => line.split(',')[0])).toEqual(['老二', '老大'])
  })

  it('writes a BOM, a header and the range oldest first', () => {
    const events = [
      logBottle(BABY, at(13, 9), 120, 'formula'),
      logSleep(BABY, at(13, 10), at(13, 11, 30), at(13, 11, 30)),
      logGrowth(BABY, at(13, 12), { weightKg: 5.2, lengthCm: null, headCm: 38 }),
      logNote(BABY, at(13, 13), '第一次翻身, 很开心'),
      deleteEvent(logBottle(BABY, at(13, 14), 90, 'formula'), at(13, 14)),
      logBottle(BABY, at(14, 9), 100, 'formula'),
    ]
    const csv = eventsToCsv(
      [{ id: BABY, name: '小米粒' }],
      events,
      at(13, 0),
      at(14, 0),
      at(14, 12),
    )
    expect(csv.startsWith('﻿宝宝,日期,开始,结束,类型')).toBe(true)
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(5)
    expect(lines[1]).toBe('小米粒,2026-10-13,09:00,,瓶喂,120 毫升 · 配方奶,,120,,,,,')
    expect(lines[2]).toContain(',10:00,11:30,小睡,1 小时 30 分钟,90,')
    expect(lines[3]).toContain(',5.2,,38,')
    expect(lines[4]).toBe('小米粒,2026-10-13,13:00,,笔记,"第一次翻身, 很开心",,,,,,,')
  })

  it('names files after the baby and the inclusive range', () => {
    expect(csvFileName('小 米/粒', at(1, 0), at(15, 0))).toBe(
      'lullabo-小-米-粒-2026-10-01-2026-10-14.csv',
    )
  })
})
