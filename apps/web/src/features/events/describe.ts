import {
  type Event,
  breastSideDurations,
  eventDurationMs,
  hasKnownDuration,
  isRunning,
} from '@lullabo/shared'

import { formatQuantity, unitLabel } from '../../lib/units'
import { m } from '../../paraglide/messages.js'
import { durationLabel } from './duration-label'
import {
  amountLabel,
  milkLabel,
  poopColorLabel,
  poopConsistencyLabel,
  sideLabel,
  sleepKindLabel,
} from './labels'

/** At or above this a temperature is shown as a fever. */
const FEVER_CELSIUS = 38

function growthDetail(data: {
  weightKg: number | null
  lengthCm: number | null
  headCm: number | null
}): string {
  return [
    data.weightKg !== null &&
      m.growthWeightValue({
        value: formatQuantity('weight', data.weightKg),
        unit: unitLabel('weight'),
      }),
    data.lengthCm !== null &&
      m.growthLengthValue({
        value: formatQuantity('length', data.lengthCm),
        unit: unitLabel('length'),
      }),
    data.headCm !== null &&
      m.growthHeadValue({
        value: formatQuantity('length', data.headCm),
        unit: unitLabel('length'),
      }),
  ]
    .filter((part) => typeof part === 'string')
    .join(' · ')
}

/** A temperature in the preferred unit, e.g. "37.5 °C". */
function temperatureText(celsius: number): string {
  return m.temperatureDetail({
    value: formatQuantity('temperature', celsius),
    unit: unitLabel('temperature'),
  })
}

const diaperLabels = { wet: m.diaperWet, dirty: m.diaperDirty, mixed: m.diaperMixed }

/** How long on each side; a side not fed is left out ("左 10 分钟", not "· 右 0 分钟"). */
function breastDetail(sides: { left: number; right: number }) {
  const left = durationLabel(sides.left)
  const right = durationLabel(sides.right)
  if (sides.left > 0 && sides.right > 0) return m.breastDetail({ left, right })
  return sides.right > 0 ? m.breastDetailRight({ right }) : m.breastDetailLeft({ left })
}

/** Title and one-line detail for an event in lists and the timeline. */
export function describeEvent(event: Event, now: number): { title: string; detail: string } {
  const running = isRunning(event)
  switch (event.type) {
    case 'feeding': {
      const data = event.data
      if (data.kind === 'breast') {
        const sides = breastSideDurations(data.segments, now)
        return {
          title: m.feedBreast(),
          detail: running ? m.eventInProgress() : breastDetail(sides),
        }
      }
      // A bottle or solids feed may record how long it took.
      const took = running
        ? [m.eventInProgress()]
        : hasKnownDuration(event)
          ? [durationLabel(eventDurationMs(event, now))]
          : []
      if (data.kind === 'bottle') {
        return {
          title: m.feedBottle(),
          detail: [
            data.breastMl !== undefined && data.formulaMl !== undefined
              ? m.bottleSplitDetail({
                  amount: formatQuantity('volume', data.amountMl),
                  breast: formatQuantity('volume', data.breastMl),
                  formula: formatQuantity('volume', data.formulaMl),
                  unit: unitLabel('volume'),
                })
              : m.bottleDetail({
                  amount: formatQuantity('volume', data.amountMl),
                  unit: unitLabel('volume'),
                  milk: milkLabel[data.milk](),
                }),
            ...took,
          ].join(' · '),
        }
      }
      return { title: m.feedSolids(), detail: [data.food, ...took].join(' · ') }
    }
    case 'sleep':
      return {
        title: sleepKindLabel[event.data.kind](),
        detail: running ? m.eventInProgress() : durationLabel(eventDurationMs(event, now)),
      }
    case 'diaper': {
      const { contents, pee, poop } = event.data
      const parts: string[] = [diaperLabels[contents]()]
      if (pee) parts.push(m.peeAmountDetail({ amount: amountLabel[pee.amount]() }))
      if (poop) {
        parts.push(
          poopColorLabel[poop.color](),
          poopConsistencyLabel[poop.consistency](),
          ...(poop.curds ? [m.poopCurdsDetail()] : []),
          m.poopAmountDetail({ amount: amountLabel[poop.amount]() }),
        )
      }
      return { title: m.categoryDiaper(), detail: parts.join(' · ') }
    }
    case 'pumping': {
      const what =
        event.data.amountMl === undefined
          ? sideLabel[event.data.side]()
          : m.pumpingDetail({
              side: sideLabel[event.data.side](),
              amount: formatQuantity('volume', event.data.amountMl),
              unit: unitLabel('volume'),
            })
      const took = hasKnownDuration(event) ? [durationLabel(eventDurationMs(event, now))] : []
      return {
        title: m.categoryPumping(),
        detail: running ? m.eventInProgress() : [what, ...took].join(' · '),
      }
    }
    case 'temperature': {
      const value = temperatureText(event.data.celsius)
      return {
        title: m.categoryTemperature(),
        detail: event.data.celsius >= FEVER_CELSIUS ? `${value} · ${m.temperatureFever()}` : value,
      }
    }
    case 'medication':
      return {
        title: m.categoryMedication(),
        detail: event.data.dose ? `${event.data.name} · ${event.data.dose}` : event.data.name,
      }
    case 'note':
      return { title: m.categoryNote(), detail: event.note ?? '' }
    case 'growth':
      return { title: m.categoryGrowth(), detail: growthDetail(event.data) }
    default:
      return event satisfies never
  }
}
