import { type Event, HOUR } from '@lullabo/shared'
import { Card } from '@lullabo/ui/card'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { useState } from 'react'

import { niceScale, ticks } from '../../components/chart/scale'
import { YGrid } from '../../components/chart/YGrid'
import { formatDate, formatNumber } from '../../lib/i18n'
import { convertToDisplay, getUnits, unitLabel } from '../../lib/units'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { durationLabel } from '../events/duration-label'
import { type DayTrend, dailyTrends } from './trends'

type Range = 7 | 30

interface Metric {
  key: string
  title: string
  /** Bar fill, as a Tailwind fill utility on the category color. */
  fill: string
  value: (day: DayTrend) => number | null
  format: (value: number) => string
  tick: (value: number) => string
  /** Tick step in the metric's unit, so ticks land on round numbers. */
  unit: number
}

const count = (value: number) => m.trendCount({ count: Math.round(value) })
const hours = (value: number) => m.trendHours({ value: formatNumber(value / HOUR) })

const METRICS: Metric[] = [
  {
    key: 'feedings',
    title: m.trendFeedings(),
    fill: 'fill-feeding',
    value: (day) => day.feedings,
    format: count,
    tick: (value) => formatNumber(value),
    unit: 1,
  },
  {
    key: 'bottle',
    title: m.trendBottle(),
    fill: 'fill-feeding',
    value: (day) => convertToDisplay('volume', day.bottleMl),
    format: (value) =>
      m.trendMl({
        amount: formatNumber(value, { maximumFractionDigits: getUnits().volume === 'oz' ? 1 : 0 }),
        unit: unitLabel('volume'),
      }),
    tick: (value) => formatNumber(value),
    get unit() {
      return getUnits().volume === 'oz' ? 1 : 10
    },
  },
  {
    key: 'sleep',
    title: m.trendSleep(),
    fill: 'fill-sleep',
    value: (day) => day.sleepMs,
    format: durationLabel,
    tick: hours,
    unit: HOUR,
  },
  {
    key: 'feed-interval',
    title: m.trendFeedInterval(),
    fill: 'fill-feeding',
    value: (day) => day.feedIntervalMs,
    format: durationLabel,
    tick: hours,
    unit: HOUR,
  },
  {
    key: 'wake-window',
    title: m.trendWakeWindow(),
    fill: 'fill-sleep',
    value: (day) => day.wakeWindowMs,
    format: durationLabel,
    tick: hours,
    unit: HOUR,
  },
  {
    key: 'diapers',
    title: m.trendDiapers(),
    fill: 'fill-diaper',
    value: (day) => day.diapers,
    format: count,
    tick: (value) => formatNumber(value),
    unit: 1,
  },
]

// Chart geometry in viewBox units; the SVG scales to the container width.
const W = 340
const H = 150
const PAD = { top: 8, right: 4, bottom: 22, left: 44 }
const GAP = 2

const shortDate = (at: number) => formatDate(at, { month: 'numeric', day: 'numeric' })

function TrendChart({ metric, days }: { metric: Metric; days: DayTrend[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const values = days.map((day) => metric.value(day))
  // Today is still in progress: drawn lighter and left out of the average.
  const complete = values
    .slice(0, -1)
    .filter((value): value is number => value !== null && value > 0)
  const average =
    complete.length > 0 ? complete.reduce((sum, value) => sum + value, 0) / complete.length : null
  const { top, step } = niceScale(Math.max(0, ...values.map((value) => value ?? 0)), metric.unit)

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const slot = plotW / days.length
  const barW = Math.max(2, slot - GAP)
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH
  const labelEvery = days.length <= 7 ? 1 : 7
  const activeIndex = days.findIndex((day) => day.day === selected)
  const active = days[activeIndex]
  const activeValue = values[activeIndex]

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-title font-extrabold">{metric.title}</h2>
        <span className="text-label font-extrabold tabular-nums" aria-live="polite">
          {/* A tapped bar's value replaces the average, so nothing floats over the chart. */}
          {active
            ? `${shortDate(active.dayStart)} · ${
                activeValue === null || activeValue === undefined
                  ? m.trendEmptyValue()
                  : metric.format(activeValue)
              }`
            : average === null
              ? m.trendEmptyValue()
              : m.trendAverage({ value: metric.format(average) })}
        </span>
      </div>
      <div className="relative">
        {/* Decorative: the values are on the bar buttons and in the data table. */}
        <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible">
          <YGrid
            values={ticks(0, top, step)}
            y={y}
            left={PAD.left}
            right={W - PAD.right}
            label={metric.tick}
          />
          {days.map((day, i) => {
            const value = values[i]
            if (value === null || value === undefined || value <= 0) return null
            const x = PAD.left + i * slot + GAP / 2
            const height = Math.max(2, plotH - (y(value) - PAD.top))
            const radius = Math.min(4, barW / 2, height)
            const barTop = PAD.top + plotH - height
            const bottom = PAD.top + plotH
            // Rounded top corners only; the bar sits square on the baseline.
            const d = `M${x},${bottom}V${barTop + radius}Q${x},${barTop} ${x + radius},${barTop}H${x + barW - radius}Q${x + barW},${barTop} ${x + barW},${barTop + radius}V${bottom}Z`
            return (
              <path
                key={day.day}
                d={d}
                className={metric.fill}
                fillOpacity={i === days.length - 1 ? 0.4 : day.day === selected ? 1 : 0.85}
              />
            )
          })}
          {days.map((day, i) =>
            i % labelEvery === (days.length - 1) % labelEvery ? (
              <text
                key={day.day}
                x={PAD.left + i * slot + slot / 2}
                y={H - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {shortDate(day.dayStart)}
              </text>
            ) : null,
          )}
        </svg>
        {days.map((day, i) => (
          <button
            key={day.day}
            type="button"
            aria-pressed={day.day === selected}
            aria-label={`${shortDate(day.dayStart)} ${values[i] === null ? m.trendEmptyValue() : metric.format(values[i] ?? 0)}`}
            onClick={() => setSelected(day.day === selected ? null : day.day)}
            onBlur={() => setSelected(null)}
            className="absolute top-0"
            style={{
              left: `${((PAD.left + i * slot) / W) * 100}%`,
              width: `${(slot / W) * 100}%`,
              height: `${((PAD.top + plotH) / H) * 100}%`,
            }}
          />
        ))}
      </div>
      <details className="text-caption">
        <summary className="cursor-pointer font-bold text-muted-foreground">
          {m.trendTable()}
        </summary>
        <table className="mt-2 w-full border-collapse tabular-nums">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-bold">{m.trendColumnDay()}</th>
              <th className="py-1 text-right font-bold">{m.trendColumnValue()}</th>
            </tr>
          </thead>
          <tbody>
            {days.toReversed().map((day) => {
              const value = metric.value(day)
              return (
                <tr key={day.day} className="border-t border-border">
                  <td className="py-1">{formatDate(day.dayStart)}</td>
                  <td className="py-1 text-right">
                    {value === null ? m.trendEmptyValue() : metric.format(value)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </Card>
  )
}

/** Daily trends over the last 7 or 30 days, one small chart per metric. */
export function TrendsView({ events }: { events: readonly Event[] }) {
  const [range, setRange] = useState<Range>(7)
  const now = useNow(60_000)
  const days = dailyTrends(events, range, now)

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl<`${Range}`>
        label={m.trendRange()}
        options={[
          { value: '7', label: m.trendRange7() },
          { value: '30', label: m.trendRange30() },
        ]}
        value={`${range}`}
        onChange={(value) => setRange(value === '30' ? 30 : 7)}
      />
      <p className="m-0 text-caption text-muted-foreground">{m.trendTodayPartial()}</p>
      {METRICS.map((metric) => (
        <TrendChart key={metric.key} metric={metric} days={days} />
      ))}
    </div>
  )
}
