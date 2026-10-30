import {
  type Baby,
  type Event,
  HOUR,
  type PlannedDose,
  VACCINE_REGIONS,
  type Vaccine,
  type VaccinationEvent,
  type VaccineChoices,
  type VaccinePlanSettings,
  type VaccineReaction,
  type VaccineRegion,
  localDateString,
  localMidnight,
  parseDay,
  vaccinePlan,
  vaccinesOf,
} from '@lullabo/shared'
import { Badge } from '@lullabo/ui/badge'
import { Button } from '@lullabo/ui/button'
import { Card } from '@lullabo/ui/card'
import { Input } from '@lullabo/ui/input'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { Sheet } from '@lullabo/ui/sheet'
import { ToggleChip } from '@lullabo/ui/toggle-chip'
import { cn } from '@lullabo/ui/utils'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'

import { Chevron } from '../../components/icons/Chevron'
import { PlusIcon } from '../../components/icons/PlusIcon'
import { VaccineIcon } from '../../components/icons/VaccineIcon'
import { type LocalStore, useLocalStore } from '../../db'
import { hideHint, isHintHidden } from '../../lib/hints'
import { formatDate } from '../../lib/i18n'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { setVaccinePlan } from '../babies/actions'
import { addEvent } from '../events/actions'
import { EditEventSheet } from '../events/EditEventSheet'
import { logVaccination } from '../events/records'
import { useBabyEvents } from '../events/use-events'
import { BookletImport } from './BookletImport'
import {
  type DoseToRecord,
  importDoses,
  savedPlan,
  withAppointment,
  withCustom,
  withoutCustom,
} from './plan-edit'
import { ReactionChips } from './ReactionChips'
import { guessRegion, regionName, sourceOf } from './region'
import { VaccineReminders } from './VaccineReminders'

const dayNumber = (day: string) => {
  const { year, month, day: date } = parseDay(day)
  return Date.UTC(year, month - 1, date) / 86_400_000
}
const daysUntil = (from: string, to: string) => dayNumber(to) - dayNumber(from)
/** In a row's small print: 5月20日, with the year only when it isn't this year's. */
const shortDay = (day: string, today: string) => {
  const { year, month, day: date } = parseDay(day)
  return formatDate(new Date(year, month - 1, date), {
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
    month: 'long',
    day: 'numeric',
  })
}
const showDay = (day: string) => {
  const { year, month, day: date } = parseDay(day)
  return formatDate(new Date(year, month - 1, date), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** The age a dose is for, as the booklet puts it: 出生, 8 月龄, 4 岁, 3 岁 4 个月. */
function ageLabel(dose: PlannedDose) {
  const { months } = dose.vaccine.doses[dose.dose - 1] ?? { months: 0 }
  if (months === 0) return m.vaccineAgeBirth()
  if (months < 24) return m.vaccineAgeMonths({ months })
  if (months % 12 !== 0) {
    return m.vaccineAgeYearsMonths({ years: Math.floor(months / 12), months: months % 12 })
  }
  return m.vaccineAgeYears({ years: months / 12 })
}

const key = (dose: PlannedDose) => `${dose.vaccine.id}:${dose.dose}`

const isVaccination = (event: Event): event is VaccinationEvent => event.type === 'vaccination'

/** When a dose given on `day` is recorded: now if today, else midday that day. */
const atOn = (day: string, today: string) =>
  day === today ? Date.now() : localMidnight(day) + 12 * HOUR

/** Records a dose given on `day`, with how the baby took it. */
function recordDose(
  store: LocalStore,
  babyId: string,
  { vaccineId, name, dose, day }: DoseToRecord,
  reactions: VaccineReaction[],
) {
  const today = localDateString()
  addEvent(
    store,
    logVaccination(
      babyId,
      atOn(day, today),
      { vaccineId, ...(name ? { name } : {}), dose, reactions },
      Date.now(),
    ),
  )
}

/** A planned dose, given on `day`, as recorded. */
const toRecord = (dose: PlannedDose, day: string): DoseToRecord => ({
  vaccineId: dose.vaccine.id,
  ...(dose.vaccine.custom ? { name: dose.vaccine.name } : {}),
  dose: dose.dose,
  day,
})

/** The baby's vaccinations: the next one, then what is due, coming and given. */
export function VaccinesPage({ baby }: { baby: Baby }) {
  const store = useLocalStore()
  const { canLog } = useAccess().forBaby(baby)
  const today = localDateString()
  const events = useBabyEvents(baby.id)
  const vaccinations = events.filter(isVaccination)
  const given = new Map(
    vaccinations.map((event) => [
      `${event.data.vaccineId}:${event.data.dose}`,
      localDateString(event.startAt),
    ]),
  )
  const recordOf = (dose: PlannedDose) =>
    vaccinations.find(
      (event) => event.data.vaccineId === dose.vaccine.id && event.data.dose === dose.dose,
    )
  // A baby with no plan yet follows the schedule of where this device seems to be.
  const choices: VaccineChoices = baby.vaccinePlan ?? {
    region: guessRegion(),
    picked: {},
    selfPaid: [],
  }
  const setChoices = (next: VaccineChoices) =>
    setVaccinePlan(store, baby.id, savedPlan(next) satisfies VaccinePlanSettings)
  const [recording, setRecording] = useState<PlannedDose | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [adding, setAdding] = useState(false)
  const [catchUpHidden, setCatchUpHidden] = useState(() => isHintHidden('vaccineCatchUp'))
  const plan = vaccinePlan(baby.birthDate, baby.sex, today, choices, given)
  const open = (dose: PlannedDose) => {
    const record = recordOf(dose)
    if (record) setEditing(record.id)
    else if (canLog) setRecording(dose)
  }
  // Those already past, for the one-tap catch-up when starting out.
  const past = plan.filter(
    (dose) => (dose.state === 'overdue' || dose.state === 'due') && dose.dueDay < today,
  )
  const offerCatchUp = canLog && !catchUpHidden && vaccinations.length === 0 && past.length > 0
  const dismissCatchUp = () => {
    hideHint('vaccineCatchUp')
    setCatchUpHidden(true)
  }

  const due = plan.filter((dose) => dose.state === 'overdue' || dose.state === 'due')
  const soon = plan.filter((dose) => dose.state === 'soon')
  const later = plan.filter((dose) => dose.state === 'later')
  const done = plan.filter((dose) => dose.state === 'done' || dose.state === 'replaced')
  const next = due[0] ?? soon[0] ?? later[0]

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/"
        className="flex min-h-touch items-center gap-1 self-start font-bold text-muted-foreground"
      >
        <Chevron direction="left" />
        {m.tabToday()}
      </Link>
      <h1 className="m-0 text-display font-extrabold">{m.vaccineTitle()}</h1>

      {offerCatchUp && (
        <Card className="flex flex-col gap-3">
          <span className="text-title font-extrabold">{m.vaccineCatchUpTitle()}</span>
          <p className="m-0 text-muted-foreground">
            {m.vaccineCatchUpBody({ count: past.length })}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={dismissCatchUp}>
              {m.vaccineCatchUpNo()}
            </Button>
            <Button
              onClick={() => {
                for (const dose of past) {
                  recordDose(store, baby.id, toRecord(dose, dose.dueDay), [])
                }
                dismissCatchUp()
              }}
            >
              {m.vaccineCatchUpYes()}
            </Button>
          </div>
        </Card>
      )}

      {next ? (
        <Card tone="primary" className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <VaccineIcon className="size-7" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-caption font-bold text-muted-foreground">
                {m.vaccineNext()}
              </span>
              <span className="text-title font-extrabold">
                {next.vaccine.name} {m.vaccineDose({ dose: next.dose })}
              </span>
              <LocalName vaccine={next.vaccine} />
            </div>
          </div>
          <p
            className={cn(
              'm-0 font-bold',
              next.state === 'overdue' ? 'text-destructive-text' : 'text-accent-foreground',
            )}
          >
            {`${showDay(next.dueDay)} · ${
              next.state === 'overdue'
                ? m.vaccineOverdue()
                : next.state === 'due'
                  ? m.vaccineDueNow()
                  : m.vaccineInDays({ days: daysUntil(today, next.dueDay) })
            }`}
          </p>
          {canLog && (
            <Button block onClick={() => setRecording(next)}>
              {m.vaccineRecord()}
            </Button>
          )}
        </Card>
      ) : (
        <Card>{m.vaccineAllDone()}</Card>
      )}

      {canLog && (
        <BookletImport
          babyId={baby.id}
          plan={choices}
          given={new Set(given.keys())}
          onSave={(read) => {
            const imported = importDoses(choices, read, new Set(given.keys()))
            if (imported.plan !== choices) setChoices(imported.plan)
            for (const record of imported.records) recordDose(store, baby.id, record, [])
            dismissCatchUp()
          }}
        />
      )}

      {due.length > 0 && (
        <Section title={m.vaccineSectionDue()}>
          {due.map((dose) => (
            <DoseRow key={key(dose)} dose={dose} today={today} onOpen={open} />
          ))}
        </Section>
      )}
      {soon.length > 0 && (
        <Section title={m.vaccineSectionSoon()}>
          {soon.map((dose) => (
            <DoseRow key={key(dose)} dose={dose} today={today} onOpen={open} />
          ))}
        </Section>
      )}
      {later.length > 0 && (
        <Section title={m.vaccineSectionLater()}>
          {later.slice(0, 8).map((dose) => (
            <DoseRow key={key(dose)} dose={dose} today={today} onOpen={open} />
          ))}
        </Section>
      )}
      {done.length > 0 && (
        <Section
          title={m.vaccineSectionDone({
            count: done.filter((dose) => dose.state === 'done').length,
          })}
          action={
            <button
              type="button"
              className="flex items-center font-bold text-accent-foreground"
              onClick={() => setShowDone((shown) => !shown)}
            >
              <Chevron direction="down" className={cn('size-5', showDone && 'rotate-180')} />
            </button>
          }
        >
          {showDone &&
            done.map((dose) => <DoseRow key={key(dose)} dose={dose} today={today} onOpen={open} />)}
        </Section>
      )}

      <Choices
        choices={choices}
        disabled={!canLog}
        onChange={setChoices}
        onAdd={() => setAdding(true)}
      />
      <VaccineReminders baby={baby} />
      <p className="m-0 text-caption text-muted-foreground">{sourceOf(choices.region)}</p>

      <DoseSheet
        dose={recording}
        today={today}
        onClose={() => setRecording(null)}
        onSave={(dose, day, reactions) => {
          recordDose(store, baby.id, toRecord(dose, day), reactions)
          setRecording(null)
        }}
        onBook={(dose, day) => {
          setChoices(withAppointment(choices, key(dose), day))
          setRecording(null)
        }}
      />
      <AddVaccineSheet
        open={adding}
        today={today}
        onClose={() => setAdding(false)}
        onSave={(name, days) => {
          setChoices(withCustom(choices, name, days).plan)
          setAdding(false)
        }}
      />
      <EditEventSheet eventId={editing} events={events} onClose={() => setEditing(null)} />
    </div>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="m-0 text-body font-extrabold">{title}</h2>
        {action}
      </div>
      {children ? <Card className="flex flex-col py-1">{children}</Card> : null}
    </section>
  )
}

/**
 * A vaccine's name where it is given (DTaP, 6-in-1), in the small print under its Chinese
 * name, for matching it with the clinic and the booklet abroad. China's have none.
 */
function LocalName({ vaccine }: { vaccine: Vaccine }) {
  if (!vaccine.local) return null
  return (
    <span lang="en" className="truncate text-caption font-normal text-muted-foreground">
      {vaccine.local}
    </span>
  )
}

const STATE_DOT: Record<PlannedDose['state'], string> = {
  done: 'bg-primary text-primary-foreground',
  replaced: 'bg-muted text-muted-foreground',
  overdue: 'bg-destructive text-primary-foreground',
  due: 'bg-medication text-primary-foreground',
  soon: 'bg-accent text-accent-foreground',
  later: 'bg-muted text-muted-foreground',
}

function DoseRow({
  dose,
  today,
  onOpen,
}: {
  dose: PlannedDose
  today: string
  onOpen: (dose: PlannedDose) => void
}) {
  const badge =
    dose.state === 'done' ? (
      <Badge tone="primary">{m.vaccineStateDone()}</Badge>
    ) : dose.state === 'overdue' ? (
      <Badge tone="destructive">{m.vaccineStateOverdue()}</Badge>
    ) : dose.state === 'due' ? (
      <Badge tone="primary">{m.vaccineStateDue()}</Badge>
    ) : dose.state === 'soon' ? (
      <Badge>{m.vaccineStateSoon({ days: daysUntil(today, dose.dueDay) })}</Badge>
    ) : null
  const detail =
    dose.state === 'done' && dose.givenDay
      ? m.vaccineGivenOn({ date: shortDay(dose.givenDay, today) })
      : dose.state === 'replaced' && dose.replacedBy
        ? m.vaccineReplacedBy({ name: dose.replacedBy })
        : dose.appointed
          ? `${m.vaccineBooked()} · ${shortDay(dose.dueDay, today)}`
          : dose.vaccine.custom
            ? m.vaccineCustomTag()
            : `${ageLabel(dose)} · ${shortDay(dose.dueDay, today)}`
  // The name abroad leads the small print, keeping the row to two lines.
  const small = [dose.vaccine.local, detail].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      disabled={dose.state === 'replaced'}
      onClick={() => onOpen(dose)}
      className="press-row flex min-h-touch items-center gap-3 border-b-2 border-border px-4 py-2 text-left last:border-b-0"
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          STATE_DOT[dose.state],
        )}
      >
        <VaccineIcon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'truncate font-extrabold',
            dose.state === 'replaced' && 'text-muted-foreground line-through',
          )}
        >
          {`${dose.vaccine.name} ${m.vaccineDose({ dose: dose.dose })}`}
        </span>
        <span className="truncate text-caption text-muted-foreground">{small}</span>
      </span>
      {badge}
    </button>
  )
}

/** Whose schedule, which kind for the vaccines with a choice, and which optional ones. */
function Choices({
  choices,
  disabled,
  onChange,
  onAdd,
}: {
  choices: VaccineChoices
  disabled: boolean
  onChange: (choices: VaccineChoices) => void
  onAdd: () => void
}) {
  const schedule = vaccinesOf(choices.region)
  const groups = [...new Set(schedule.flatMap((vaccine) => vaccine.choice?.group ?? []))]
  const optional = schedule.filter((vaccine) => vaccine.programme === 'optional')
  // Another region's vaccines are others: what was picked there no longer applies.
  // The family's own vaccines and their days stay, wherever the family lives.
  const moveTo = (region: VaccineRegion) =>
    onChange({
      ...choices,
      region,
      picked: {},
      selfPaid: [],
      appointments: Object.fromEntries(
        Object.entries(choices.appointments ?? {}).filter(([dose]) => dose.startsWith('custom-')),
      ),
    })
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 px-1 text-body font-extrabold">{m.vaccineChoices()}</h2>
      <Card className="flex flex-col gap-4">
        {VACCINE_REGIONS.length > 1 && (
          <div className="flex flex-col gap-2">
            <span className="font-bold">{m.vaccineRegion()}</span>
            <div className="flex flex-wrap gap-2">
              {VACCINE_REGIONS.map((region) => (
                <ToggleChip
                  key={region}
                  pressed={region === choices.region}
                  disabled={disabled}
                  className="min-h-touch rounded-full px-4 font-extrabold"
                  onClick={() => region !== choices.region && moveTo(region)}
                >
                  {regionName(region)}
                </ToggleChip>
              ))}
            </div>
          </div>
        )}
        {groups.map((group) => {
          const options = schedule.filter((vaccine) => vaccine.choice?.group === group)
          return (
            <SegmentedControl
              key={group}
              label={options[0]?.against ?? group}
              labelStyle="field"
              options={options.map((vaccine) => ({
                value: vaccine.id,
                label: vaccine.choice?.label ?? vaccine.name,
              }))}
              value={choices.picked[group] ?? options[0]?.id ?? ''}
              onChange={(id) =>
                onChange({ ...choices, picked: { ...choices.picked, [group]: id } })
              }
            />
          )
        })}
        {optional.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="font-bold">
              {choices.region === 'cn' ? m.vaccineSelfPaid() : m.vaccineOptional()}
            </span>
            <div className="flex flex-wrap gap-2">
              {optional.map((vaccine) => {
                const on = choices.selfPaid.includes(vaccine.id)
                return (
                  <ToggleChip
                    key={vaccine.id}
                    pressed={on}
                    disabled={disabled}
                    className={cn(
                      'flex min-h-touch flex-col justify-center px-4 font-extrabold',
                      vaccine.local ? 'rounded-xl py-1.5' : 'rounded-full',
                    )}
                    onClick={() =>
                      onChange({
                        ...choices,
                        selfPaid: on
                          ? choices.selfPaid.filter((id) => id !== vaccine.id)
                          : [...choices.selfPaid, vaccine.id],
                      })
                    }
                  >
                    {vaccine.name}
                    <LocalName vaccine={vaccine} />
                  </ToggleChip>
                )
              })}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className="font-bold">{m.vaccineCustom()}</span>
          <div className="flex flex-wrap gap-2">
            {(choices.custom ?? []).map((vaccine) => (
              <button
                key={vaccine.id}
                type="button"
                disabled={disabled}
                aria-label={m.vaccineCustomRemove({ name: vaccine.name })}
                onClick={() => onChange(withoutCustom(choices, vaccine.id))}
                className="press flex min-h-touch items-center gap-2 rounded-full border-2 border-b-4 border-border bg-card pr-3 pl-4 font-extrabold"
              >
                {vaccine.name}
                <PlusIcon className="size-4 rotate-45 text-muted-foreground" />
              </button>
            ))}
            {!disabled && (
              <button
                type="button"
                onClick={onAdd}
                className="press flex min-h-touch items-center gap-1.5 rounded-full border-2 border-b-4 border-dashed border-border px-4 font-extrabold text-accent-foreground"
              >
                <PlusIcon className="size-4" />
                {m.vaccineCustomAdd()}
              </button>
            )}
          </div>
        </div>
      </Card>
    </section>
  )
}

/** A dose not given yet: record it as given, or book it for another day. */
function DoseSheet({
  dose,
  today,
  onClose,
  onSave,
  onBook,
}: {
  dose: PlannedDose | null
  today: string
  onClose: () => void
  onSave: (dose: PlannedDose, day: string, reactions: VaccineReaction[]) => void
  onBook: (dose: PlannedDose, day: string | null) => void
}) {
  const [mode, setMode] = useState<'record' | 'book'>('record')
  const [day, setDay] = useState(today)
  const [booked, setBooked] = useState<string | null>(null)
  const [reactions, setReactions] = useState<VaccineReaction[]>([])
  const reset = () => {
    setMode('record')
    setDay(today)
    setBooked(null)
    setReactions([])
  }
  const close = () => {
    reset()
    onClose()
  }
  return (
    <Sheet open={dose !== null} onClose={close} title={m.vaccineRecord()}>
      {dose && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <VaccineIcon className="size-7" />
            </span>
            <span className="flex flex-col">
              <span className="text-title font-extrabold">
                {`${dose.vaccine.name} ${m.vaccineDose({ dose: dose.dose })}`}
              </span>
              <span className="text-caption text-muted-foreground">
                {[dose.vaccine.local, dose.vaccine.against].filter(Boolean).join(' · ')}
              </span>
            </span>
          </div>
          <SegmentedControl
            label={m.vaccineRecord()}
            labelStyle="hidden"
            options={[
              { value: 'record', label: m.vaccineGivenTab() },
              { value: 'book', label: m.vaccineBook() },
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === 'record' ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-bold">{m.vaccineDate()}</span>
                <input
                  type="date"
                  max={today}
                  value={day}
                  onChange={(event) => setDay(event.target.value || today)}
                  className="min-h-touch rounded-lg border-2 border-border bg-muted px-4 font-extrabold"
                />
              </label>
              <ReactionChips value={reactions} onChange={setReactions} />
              <Button
                size="lg"
                block
                onClick={() => {
                  onSave(dose, day, reactions)
                  reset()
                }}
              >
                {m.actionSave()}
              </Button>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-bold">{m.vaccineBookDate()}</span>
                <input
                  type="date"
                  value={booked ?? dose.dueDay}
                  onChange={(event) => setBooked(event.target.value || null)}
                  className="min-h-touch rounded-lg border-2 border-border bg-muted px-4 font-extrabold"
                />
              </label>
              <Button
                size="lg"
                block
                onClick={() => {
                  onBook(dose, booked ?? dose.dueDay)
                  reset()
                }}
              >
                {m.actionSave()}
              </Button>
              {dose.appointed && !dose.vaccine.custom && (
                <Button
                  variant="outline"
                  block
                  onClick={() => {
                    onBook(dose, null)
                    reset()
                  }}
                >
                  {m.vaccineBookReset()}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}

/** A vaccine of the family's own: its name, and the day of each dose. */
function AddVaccineSheet({
  open,
  today,
  onClose,
  onSave,
}: {
  open: boolean
  today: string
  onClose: () => void
  onSave: (name: string, days: string[]) => void
}) {
  const [name, setName] = useState('')
  const [days, setDays] = useState<string[]>([today])
  const close = () => {
    setName('')
    setDays([today])
    onClose()
  }
  return (
    <Sheet open={open} onClose={close} title={m.vaccineCustomAdd()}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) {
            onSave(name.trim(), days)
            setName('')
            setDays([today])
          }
        }}
      >
        <Input
          label={m.vaccineCustomName()}
          value={name}
          maxLength={40}
          placeholder={m.vaccineCustomNameHint()}
          onChange={(event) => setName(event.target.value)}
        />
        <SegmentedControl
          label={m.vaccineCustomDoses()}
          labelStyle="field"
          options={[1, 2, 3, 4, 5].map((count) => ({ value: String(count), label: String(count) }))}
          value={String(days.length)}
          onChange={(count) =>
            setDays((before) =>
              Array.from(
                { length: Number(count) },
                (_, index) => before[index] ?? before.at(-1) ?? today,
              ),
            )
          }
        />
        {days.map((day, index) => (
          // The dose's number: the days are the doses in order.
          // oxlint-disable-next-line react/no-array-index-key
          <label key={index} className="flex flex-col gap-1">
            <span className="font-bold">{m.vaccineCustomDoseDay({ dose: index + 1 })}</span>
            <input
              type="date"
              value={day}
              onChange={(event) =>
                event.target.value &&
                setDays((all) =>
                  all.map((other, at) => (at === index ? event.target.value : other)),
                )
              }
              className="min-h-touch rounded-lg border-2 border-border bg-muted px-4 font-extrabold"
            />
          </label>
        ))}
        <Button type="submit" size="lg" block disabled={!name.trim()}>
          {m.actionSave()}
        </Button>
      </form>
    </Sheet>
  )
}
