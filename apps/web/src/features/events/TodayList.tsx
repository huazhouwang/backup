import { type Event, hasKnownDuration, startOfLocalDay } from '@lullabo/shared'
import { Bun } from '@lullabo/ui/bun'
import { glowOnce, rowInOut, slideFromSide } from '@lullabo/ui/motion'
import { showToast } from '@lullabo/ui/toast'
import { AnimatePresence, m as motion } from 'motion/react'
import { useState } from 'react'

import { Chevron } from '../../components/icons/Chevron'
import { useLocalStore } from '../../db'
import { formatDate, formatTime } from '../../lib/i18n'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { saveEvent } from './actions'
import { describeEvent } from './describe'
import { EditEventSheet } from './EditEventSheet'
import { EventIcon, eventIconProps } from './EventIcon'
import { restoreEvent } from './records'
import { onDayList } from './summary'

const UNDO_MS = 6000

/**
 * A day's events for the selected baby, newest first; tap a row to edit it. Opens on today,
 * with arrows to step back to earlier days.
 */
export function TodayList({ events }: { events: readonly Event[] }) {
  const store = useLocalStore()
  const now = useNow(60_000)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [daysBack, setDaysBack] = useState(0)
  // Which way the last day change went, so the list slides in from that side.
  const [direction, setDirection] = useState<1 | -1>(1)
  const showDay = (days: number) => {
    setDirection(days > daysBack ? -1 : 1)
    setDaysBack(days)
  }
  const dayStart = startOfLocalDay(now, -daysBack)
  const dayEnd = startOfLocalDay(now, 1 - daysBack)
  const today = events.filter((event) => onDayList(event, dayStart, dayEnd, now))
  const heading =
    daysBack === 0
      ? m.todaySummaryTitle()
      : daysBack === 1
        ? m.dayYesterdayRecords()
        : m.dayRecords({ date: formatDate(dayStart) })
  const close = () => setEditingId(null)

  const offerUndo = (deleted: Event) =>
    showToast(m.eventDeleted(), {
      id: 'event-deleted',
      duration: UNDO_MS,
      action: {
        label: m.actionUndo(),
        onClick: () => saveEvent(store, restoreEvent(deleted, Date.now())),
      },
    })

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-title font-extrabold">{heading}</h2>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            aria-label={m.dayPrev()}
            onClick={() => showDay(daysBack + 1)}
            className="flex size-touch items-center justify-center rounded-full text-muted-foreground active:bg-muted"
          >
            <Chevron direction="left" className="size-6" />
          </button>
          <button
            type="button"
            aria-label={m.dayNext()}
            disabled={daysBack === 0}
            onClick={() => showDay(Math.max(0, daysBack - 1))}
            className="flex size-touch items-center justify-center rounded-full text-muted-foreground active:bg-muted disabled:opacity-30"
          >
            <Chevron direction="right" className="size-6" />
          </button>
        </div>
      </div>
      {daysBack > 0 && (
        <button
          type="button"
          onClick={() => showDay(0)}
          className="self-start font-bold text-accent-foreground"
        >
          {m.dayBackToToday()}
        </button>
      )}
      <AnimatePresence initial={false} mode="wait" custom={direction}>
        <motion.div key={daysBack} custom={direction} {...slideFromSide}>
          {today.length === 0 && (
            <div className="flex items-center gap-3">
              <Bun mood="asleep" className="size-14" />
              <p className="m-0 text-muted-foreground">
                {daysBack === 0 ? m.todayEmpty() : m.dayEmpty()}
              </p>
            </div>
          )}
          {/* Always mounted, so the first record of the day animates in like the rest. */}
          <ul className="m-0 flex list-none flex-col p-0">
            {/* New records slide in and glow briefly; deleted ones fold away. */}
            <AnimatePresence initial={false}>
              {today.map((event) => {
                const { title, detail } = describeEvent(event, now)
                const time = formatTime(event.startAt)
                // Duration records show when they ended under when they started.
                const ended =
                  hasKnownDuration(event) && event.endAt !== null ? formatTime(event.endAt) : null
                return (
                  <motion.li
                    key={event.id}
                    layout="position"
                    {...rowInOut}
                    className="relative -mx-2 overflow-hidden px-2 pb-0.5"
                  >
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-accent"
                      {...glowOnce}
                    />
                    <button
                      type="button"
                      aria-label={m.eventEditLabel({ time, title })}
                      onClick={() => setEditingId(event.id)}
                      className="press-row flex min-h-touch w-full items-center gap-3 py-3 text-left"
                    >
                      <EventIcon {...eventIconProps(event)} className="size-7" />
                      <span className="flex w-12 shrink-0 flex-col text-muted-foreground tabular-nums">
                        {event.startAt < dayStart && (
                          <span className="text-caption">{m.eventDayBefore()}</span>
                        )}
                        <span>{time}</span>
                        {ended && (
                          <span className="text-caption">{m.eventUntil({ time: ended })}</span>
                        )}
                      </span>
                      <span className="shrink-0 font-extrabold">{title}</span>
                      <span className="truncate text-muted-foreground">{detail}</span>
                    </button>
                    {/* The row is widened for its pressed background; the divider is not. */}
                    <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 bg-border" />
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </motion.div>
      </AnimatePresence>

      <EditEventSheet eventId={editingId} events={events} onClose={close} onDeleted={offerUndo} />
    </section>
  )
}
