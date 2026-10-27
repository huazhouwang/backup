import { type Baby, type Event, eventDurationMs, hasKnownDuration } from '@lullabo/shared'

import { formatDate } from '../../lib/i18n'
import { m } from '../../paraglide/messages.js'
import { describeEvent } from '../events/describe'

/**
 * Quotes a field when needed. Text a spreadsheet would run as a formula (starting with
 * =, +, -, @, tab or CR) is prefixed with an apostrophe; numbers are written as is.
 */
export function csvField(value: string | number | null): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value)
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (at: number) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const localTime = (at: number) => {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Machine-readable amounts next to the human description, for sums and charts. */
function amounts(event: Event): {
  ml: number | null
  celsius: number | null
  growth: (number | null)[]
} {
  const none = { ml: null, celsius: null, growth: [null, null, null] }
  switch (event.type) {
    case 'feeding':
      return { ...none, ml: event.data.kind === 'bottle' ? event.data.amountMl : null }
    case 'pumping':
      return { ...none, ml: event.data.amountMl ?? null }
    case 'temperature':
      return { ...none, celsius: event.data.celsius }
    case 'growth':
      return { ...none, growth: [event.data.weightKg, event.data.lengthCm, event.data.headCm] }
    default:
      return none
  }
}

/**
 * CSV of the babies' events in [from, to), oldest first, one baby name per row. Starts with a
 * UTF-8 byte order mark so spreadsheet apps (Excel in particular) read the Chinese text.
 */
export function eventsToCsv(
  babies: readonly Pick<Baby, 'id' | 'name'>[],
  events: readonly Event[],
  from: number,
  to: number,
  now: number,
): string {
  const header = [
    m.csvBaby(),
    m.csvDate(),
    m.csvStart(),
    m.csvEnd(),
    m.csvType(),
    m.csvDetail(),
    m.csvDurationMinutes(),
    m.csvAmountMl(),
    m.csvTemperature(),
    m.csvWeight(),
    m.csvLength(),
    m.csvHead(),
    m.csvNote(),
  ]
  const names = new Map(babies.map((baby) => [baby.id, baby.name]))
  const rows = events
    .filter(
      (event) =>
        names.has(event.babyId) &&
        event.deletedAt === null &&
        event.startAt >= from &&
        event.startAt < to,
    )
    .toSorted((a, b) => a.startAt - b.startAt)
    .map((event) => {
      const { title, detail } = describeEvent(event, now)
      const duration = eventDurationMs(event, now)
      const { ml, celsius, growth } = amounts(event)
      return [
        names.get(event.babyId) ?? '',
        localDate(event.startAt),
        localTime(event.startAt),
        hasKnownDuration(event) && event.endAt !== null ? localTime(event.endAt) : null,
        title,
        detail,
        duration > 0 ? Math.round(duration / 60_000) : null,
        ml,
        celsius,
        growth[0] ?? null,
        growth[1] ?? null,
        growth[2] ?? null,
        // A note's text is already its detail.
        event.type === 'note' ? null : event.note,
      ]
    })
  return `﻿${[header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`
}

export function csvFileName(babyName: string, from: number, to: number): string {
  const last = to - 1
  const safeName = babyName.replaceAll(/[\\/:*?"<>|\s]+/g, '-')
  return `lullabo-${safeName}-${localDate(from)}-${localDate(last)}.csv`
}

/** Saves the text as a file through a temporary download link (works offline). */
export function downloadCsv(fileName: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers read the blob after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const exportRangeLabel = (from: number, to: number) =>
  `${formatDate(from, { year: 'numeric', month: 'short', day: 'numeric' })} – ${formatDate(to - 1, { year: 'numeric', month: 'short', day: 'numeric' })}`
