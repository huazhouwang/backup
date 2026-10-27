import { RECORD_KINDS } from '@lullabo/shared'
import type { Dispatch } from 'react'

import { FormError } from '../../components/ui/FormError'
import { m } from '../../paraglide/messages.js'
import { type DurationTimes, type DurationTimesAction, resolveTimes } from './duration-times'
import { DurationField } from './DurationField'
import { durationChipTone } from './kinds'
import { sideLabel } from './labels'
import { AgoChips } from './QuickTimeField'
import { TimeRow } from './TimeRow'

/** "When it ended" choices, in minutes ago; 0 is "刚刚". */
const ENDED_AGO = [0, 5, 15, 30, 60, 120] as const

/**
 * Start, duration and end of a duration record, changed only through `timesReducer`. With
 * `quickEnd`, "N 分钟前" choices for when it ended (logging afterwards): the start is worked
 * out back from it and how long it took.
 */
export function DurationTimesFields({
  times,
  dispatch,
  now,
  errors,
  quickEnd = false,
}: {
  times: DurationTimes
  dispatch: Dispatch<DurationTimesAction>
  now: number
  errors: { start?: string; end?: string; duration?: string }
  quickEnd?: boolean
}) {
  const definition = RECORD_KINDS[times.kind]
  const tone = durationChipTone(times.kind)
  const { startAt, endAt } = resolveTimes(times, now)

  return (
    <div className="flex flex-col gap-4">
      {quickEnd && (
        <AgoChips
          legend={m.durationEndedWhen()}
          showLegend
          options={ENDED_AGO}
          selected={times.startAt === null ? times.endedAgo : null}
          onSelect={(minutes) => dispatch({ type: 'endedAgo', minutes })}
        />
      )}
      {times.kind === 'breast' ? (
        (['left', 'right'] as const).map((side) => (
          <DurationField
            key={side}
            legend={m.breastSideHowLong({ side: sideLabel[side]() })}
            choices={definition.durations}
            noneLabel={m.breastSideNone()}
            value={times.sides[side]}
            onChange={(minutes) => dispatch({ type: 'side', side, minutes })}
            tone={tone}
          />
        ))
      ) : (
        <DurationField
          legend={m.durationHowLong()}
          choices={definition.durations}
          value={times.minutes}
          onChange={(minutes) => dispatch({ type: 'minutes', minutes })}
          tone={tone}
          error={errors.duration}
        />
      )}
      {times.kind === 'breast' && errors.duration && <FormError>{errors.duration}</FormError>}
      {/* Start and end together, after how long: what they add up to, either can be changed. */}
      <div className="flex flex-col gap-2">
        <TimeRow
          label={m.eventStart()}
          at={startAt}
          onChange={(at) => dispatch({ type: 'start', at })}
          now={now}
          error={errors.start}
        />
        <TimeRow
          label={m.eventEnd()}
          at={endAt}
          onChange={(at) => dispatch({ type: 'end', at, now: Date.now() })}
          now={now}
          error={errors.end}
        />
        {times.startAt === null && (
          <p className="m-0 text-caption text-fg-muted">{m.durationStartDerived()}</p>
        )}
      </div>
    </div>
  )
}
