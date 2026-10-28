import type { Baby, Event, GrowthEvent } from '@lullabo/shared'
import { Badge } from '@lullabo/ui/badge'
import { Card } from '@lullabo/ui/card'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { useState } from 'react'

import { niceStep, ticks } from '../../components/chart/scale'
import { YGrid } from '../../components/chart/YGrid'
import { ListRow } from '../../components/ListRow'
import { formatDate, formatNumber } from '../../lib/i18n'
import { convertToDisplay, formatQuantity, unitLabel } from '../../lib/units'
import { m } from '../../paraglide/messages.js'
import { EditEventSheet } from '../events/EditEventSheet'
import {
  type GrowthMeasure,
  type GrowthSex,
  MAX_MONTHS,
  REFERENCE_CURVES,
  ageInMonths,
  lmsAt,
  percentileOf,
  valueAtZ,
} from './growth'

const FIELD = { weight: 'weightKg', length: 'lengthCm', head: 'headCm' } as const
const measureLabel = {
  weight: m.growthMeasureWeight,
  length: m.growthMeasureLength,
  head: m.growthMeasureHead,
}
const QUANTITY = { weight: 'weight', length: 'length', head: 'length' } as const

function formatMeasure(measure: GrowthMeasure, value: number): string {
  const quantity = QUANTITY[measure]
  const params = { value: formatQuantity(quantity, value), unit: unitLabel(quantity) }
  return measure === 'weight' ? m.growthWeightValue(params) : m.growthLengthValue(params)
}

interface Point {
  event: GrowthEvent
  months: number
  value: number
  percentile: number | undefined
}

const isGrowth = (event: Event): event is GrowthEvent => event.type === 'growth'

// Chart geometry in viewBox units; the SVG scales to the container width.
const W = 340
const H = 240
const PAD = { top: 12, right: 34, bottom: 28, left: 34 }

const path = (coords: [number, number][]) =>
  coords.map(([cx, cy], i) => `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)},${cy.toFixed(1)}`).join('')

function GrowthChart({
  measure,
  sex,
  points,
  monthsNow,
}: {
  measure: GrowthMeasure
  sex: GrowthSex
  points: Point[]
  monthsNow: number
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const charted = points.filter((point) => point.months <= MAX_MONTHS)
  const lastMonths = Math.max(monthsNow, ...charted.map((point) => point.months))
  const xMax = Math.min(MAX_MONTHS, Math.max(6, Math.ceil(lastMonths) + 2))

  // Charted in the preferred unit so the axis has round ticks.
  const toUnits = (value: number) => convertToDisplay(QUANTITY[measure], value)
  const samples = Array.from({ length: xMax * 4 + 1 }, (_, i) => i / 4)
  const curves = REFERENCE_CURVES.map((curve) => {
    const values = samples.map((months) => {
      const lms = lmsAt(measure, sex, months)
      return lms ? toUnits(valueAtZ(curve.z, lms)) : 0
    })
    return { percentile: curve.percentile, values }
  })
  const allValues = [
    ...curves.flatMap((curve) => curve.values),
    ...charted.map((p) => toUnits(p.value)),
  ]
  const step = niceStep(Math.max(...allValues) - Math.min(...allValues))
  const yMin = Math.floor(Math.min(...allValues) / step) * step
  const yMax = Math.ceil(Math.max(...allValues) / step) * step

  const x = (months: number) => PAD.left + (months / xMax) * (W - PAD.left - PAD.right)
  // Ticks and curves are in display units; `y` places stored readings.
  const yDisplay = (value: number) =>
    H - PAD.bottom - ((value - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom)
  const y = (value: number) => yDisplay(toUnits(value))

  const yTicks = ticks(yMin, yMax, step)
  const xTicks = Array.from({ length: Math.floor(xMax / 3) + 1 }, (_, i) => i * 3)
  const active = charted.find((point) => point.event.id === selected)

  return (
    <div className="relative">
      {/* Decorative: the readings are in the table below and on the point buttons. */}
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible">
        <YGrid
          values={yTicks}
          y={yDisplay}
          left={PAD.left}
          right={W - PAD.right}
          label={formatNumber}
        />
        {xTicks.map((tick) => (
          <text
            key={tick}
            x={x(tick)}
            y={H - PAD.bottom + 16}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px] tabular-nums"
          >
            {m.ageMonths({ months: tick })}
          </text>
        ))}
        {curves.map((curve) => (
          <g key={curve.percentile}>
            <path
              d={path(samples.map((months, i) => [x(months), yDisplay(curve.values[i] ?? 0)]))}
              fill="none"
              className="stroke-muted-foreground"
              strokeOpacity={curve.percentile === 50 ? 0.9 : 0.4}
              strokeWidth={curve.percentile === 50 ? 2 : 1.25}
              strokeLinecap="round"
            />
            <text
              x={W - PAD.right + 4}
              y={yDisplay(curve.values.at(-1) ?? 0)}
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {`P${curve.percentile}`}
            </text>
          </g>
        ))}
        {charted.length > 1 && (
          <path
            d={path(charted.map((point) => [x(point.months), y(point.value)]))}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
        {charted.map((point) => (
          <circle
            key={point.event.id}
            cx={x(point.months)}
            cy={y(point.value)}
            r={point.event.id === selected ? 6.5 : 5}
            className="fill-primary stroke-background"
            strokeWidth={2}
          />
        ))}
      </svg>
      {charted.map((point) => (
        <button
          key={point.event.id}
          type="button"
          aria-pressed={point.event.id === selected}
          aria-label={`${formatDate(point.event.startAt, { month: 'short', day: 'numeric' })} ${formatMeasure(measure, point.value)}`}
          onClick={() => setSelected(point.event.id === selected ? null : point.event.id)}
          onBlur={() => setSelected(null)}
          // A touch-sized target centred on the point.
          className="absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${(x(point.months) / W) * 100}%`, top: `${(y(point.value) / H) * 100}%` }}
        />
      ))}
      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-foreground px-3 py-1.5 text-caption whitespace-nowrap text-background"
          style={{
            left: `${(x(active.months) / W) * 100}%`,
            top: `calc(${(y(active.value) / H) * 100}% - 10px)`,
          }}
        >
          <div className="font-bold">{formatMeasure(measure, active.value)}</div>
          <div>
            {formatDate(active.event.startAt, { year: 'numeric', month: 'short', day: 'numeric' })}
            {active.percentile !== undefined &&
              ` · ${m.growthPercentile({ value: Math.round(active.percentile) })}`}
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-primary" />
          {m.growthLegendBaby()}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-muted-foreground" />
          {m.growthLegendCurves()}
        </span>
      </div>
    </div>
  )
}

/** Growth measurements against the WHO percentile curves, plus a table of every reading. */
export function GrowthView({ baby, events }: { baby: Baby; events: readonly Event[] }) {
  const [measure, setMeasure] = useState<GrowthMeasure>('weight')
  const [chosenSex, setChosenSex] = useState<GrowthSex>('female')
  const sex: GrowthSex = baby.sex === 'unspecified' ? chosenSex : baby.sex
  const [editingId, setEditingId] = useState<string | null>(null)
  // Ages are measured from the birth date; "now" only sets how far the chart extends.
  // oxlint-disable-next-line react/purity
  const monthsNow = ageInMonths(baby.birthDate, Date.now())

  const points: Point[] = events
    .filter(isGrowth)
    .flatMap((event) => {
      const value = event.data[FIELD[measure]]
      if (value === null) return []
      const months = ageInMonths(baby.birthDate, event.startAt)
      return [{ event, months, value, percentile: percentileOf(measure, sex, months, value) }]
    })
    .toSorted((a, b) => a.event.startAt - b.event.startAt)

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl<GrowthMeasure>
        label={m.statsViewGrowth()}
        options={(['weight', 'length', 'head'] as const).map((value) => ({
          value,
          label: measureLabel[value](),
        }))}
        value={measure}
        onChange={setMeasure}
      />
      {baby.sex === 'unspecified' && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-caption text-muted-foreground">{m.growthNeedsSex()}</p>
          <SegmentedControl<GrowthSex>
            label={m.growthStandard()}
            options={[
              { value: 'female', label: m.growthStandardFemale() },
              { value: 'male', label: m.growthStandardMale() },
            ]}
            value={chosenSex}
            onChange={setChosenSex}
          />
        </div>
      )}
      <Card className="flex flex-col gap-2">
        <h2 className="text-title font-extrabold">
          {m.growthChartLabel({ measure: measureLabel[measure]() })}
        </h2>
        {monthsNow <= MAX_MONTHS || points.some((point) => point.months <= MAX_MONTHS) ? (
          <GrowthChart measure={measure} sex={sex} points={points} monthsNow={monthsNow} />
        ) : (
          <p className="m-0 text-muted-foreground">{m.growthBeyondRange()}</p>
        )}
        <p className="m-0 text-caption text-muted-foreground">{m.growthSource()}</p>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-title font-extrabold">{m.growthTableTitle()}</h2>
        {points.length === 0 ? (
          <p className="m-0 text-muted-foreground">{m.growthEmpty()}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {points.toReversed().map((point) => (
              <li key={point.event.id} className="border-b-2 border-border">
                <ListRow
                  onClick={() => setEditingId(point.event.id)}
                  title={
                    <span className="tabular-nums">{formatMeasure(measure, point.value)}</span>
                  }
                  detail={`${formatDate(point.event.startAt, { year: 'numeric', month: 'short', day: 'numeric' })} · ${m.ageMonths({ months: formatNumber(point.months, { maximumFractionDigits: 1 }) })}`}
                  trailing={
                    point.percentile !== undefined && (
                      <Badge
                        tone={
                          point.percentile < 3 || point.percentile > 97 ? 'destructive' : 'primary'
                        }
                        className="shrink-0"
                      >
                        {m.growthPercentile({ value: Math.round(point.percentile) })}
                      </Badge>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <EditEventSheet eventId={editingId} events={events} onClose={() => setEditingId(null)} />
    </div>
  )
}
