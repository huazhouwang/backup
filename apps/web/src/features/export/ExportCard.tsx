import { localDateString, localMidnight, shiftDay } from '@lullabo/shared'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Chevron } from '../../components/ui/Chevron'
import { Input } from '../../components/ui/Input'
import { Sheet } from '../../components/ui/Sheet'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { BabyOptions, OptionButton } from '../babies/BabyOptions'
import { useBabies } from '../babies/use-babies'
import { useEventsByBaby } from '../events/use-events'
import { csvFileName, downloadCsv, eventsToCsv, exportRangeLabel } from './csv'

const ALL = 'all'

/** Exports one baby's events, or every baby's, in a date range as CSV, entirely on the device. */
export function ExportCard() {
  const { active, archived } = useBabies()
  const babies = [...active, ...archived]
  const now = useNow(60_000)
  const today = localDateString(now)
  const [babyId, setBabyId] = useState<string>(ALL)
  const [picking, setPicking] = useState(false)
  const single = babies.find((item) => item.id === babyId)
  const selected = single ? [single] : babies
  const eventsByBaby = useEventsByBaby(babies.map((baby) => baby.id))
  const events = selected.flatMap((baby) => eventsByBaby.get(baby.id) ?? [])
  const [from, setFrom] = useState(() => shiftDay(today, -29))
  const [to, setTo] = useState(today)

  if (babies.length === 0) return null
  const start = localMidnight(from)
  // The end date is inclusive.
  const end = localMidnight(to, 1)
  const valid = from !== '' && to !== '' && start < end
  const count = valid
    ? events.filter((event) => event.startAt >= start && event.startAt < end).length
    : 0
  const title = selected.length === 1 ? selected[0]!.name : m.babyAll()
  const pick = (id: string) => {
    setBabyId(id)
    setPicking(false)
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="m-0 text-fg-muted">{m.exportBody()}</p>
      {babies.length > 1 && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex min-h-touch items-center gap-2 press rounded-xl border-2 border-b-4 border-border px-3 py-2 text-left"
        >
          <span className="text-fg-muted">{m.exportBaby()}</span>
          <span className="min-w-0 flex-1 truncate font-extrabold">{title}</span>
          <Chevron />
        </button>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={m.exportFrom()}
          type="date"
          value={from}
          max={to || today}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          label={m.exportTo()}
          type="date"
          value={to}
          min={from}
          max={today}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <p className="m-0 text-caption text-fg-muted" aria-live="polite">
        {!valid
          ? m.exportRangeInvalid()
          : count === 0
            ? m.exportEmpty()
            : m.exportCount({ count, range: exportRangeLabel(start, end) })}
      </p>
      <Button
        variant="soft"
        tone="primary"
        block
        disabled={!valid || count === 0}
        onClick={() =>
          downloadCsv(
            csvFileName(title, start, end),
            eventsToCsv(selected, events, start, end, Date.now()),
          )
        }
      >
        {m.exportButton()}
      </Button>

      <Sheet open={picking} onClose={() => setPicking(false)} title={m.exportPickBaby()}>
        <OptionButton selected={!single} onClick={() => pick(ALL)}>
          <span className="flex flex-col">
            <span className="font-extrabold">{m.babyAll()}</span>
            <span className="text-caption text-fg-muted">
              {m.exportBabyAllHint({ count: babies.length })}
            </span>
          </span>
        </OptionButton>
        <BabyOptions
          babies={babies}
          selectedId={single?.id ?? null}
          onSelect={pick}
          badges={
            new Map(
              archived.map((baby) => [baby.id, { label: m.babyArchivedGroup(), tone: 'muted' }]),
            )
          }
        />
      </Sheet>
    </Card>
  )
}
