import {
  type Baby,
  type Event,
  HOUR,
  type PlannedDose,
  VACCINES,
  type VaccinationEvent,
  type VaccineChoices,
  type VaccinePlanSettings,
  type VaccineReaction,
  localDateString,
  localMidnight,
  parseDay,
  vaccinePlan,
} from '@lullabo/shared'
import { Badge } from '@lullabo/ui/badge'
import { Button } from '@lullabo/ui/button'
import { Card } from '@lullabo/ui/card'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { Sheet } from '@lullabo/ui/sheet'
import { ToggleChip } from '@lullabo/ui/toggle-chip'
import { cn } from '@lullabo/ui/utils'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'

import { Chevron } from '../../components/icons/Chevron'
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
import { ReactionChips } from './ReactionChips'
import { VaccineReminders } from './VaccineReminders'

const dayNumber = (day: string) => {
  const { year, month, day: date } = parseDay(day)
  return Date.UTC(year, month - 1, date) / 86_400_000
}
const daysUntil = (from: string, to: string) => dayNumber(to) - dayNumber(from)
const showDay = (day: string) => {
  const { year, month, day: date } = parseDay(day)
  return formatDate(new Date(year, month - 1, date), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** The age a dose is for, as the booklet puts it: 出生, 8 月龄, 4 岁. */
function ageLabel(dose: PlannedDose) {
  const { months } = dose.vaccine.doses[dose.dose - 1] ?? { months: 0 }
  if (months === 0) return m.vaccineAgeBirth()
  if (months < 24 || months % 12 !== 0) return m.vaccineAgeMonths({ months })
  return m.vaccineAgeYears({ years: months / 12 })
}

const key = (dose: PlannedDose) => `${dose.vaccine.id}:${dose.dose}`

const DEFAULT_PLAN: VaccinePlanSettings = { region: 'cn', picked: {}, selfPaid: [] }

const isVaccination = (event: Event): event is VaccinationEvent => event.type === 'vaccination'

/** When a dose given on `day` is recorded: now if today, else midday that day. */
const atOn = (day: string, today: string) =>
  day === today ? Date.now() : localMidnight(day) + 12 * HOUR

/** Records a dose given on `day`, with how the baby took it. */
function recordDose(
  store: LocalStore,
  babyId: string,
  dose: PlannedDose,
  day: string,
  reactions: VaccineReaction[],
) {
  const today = localDateString()
  addEvent(
    store,
    logVaccination(
      babyId,
      atOn(day, today),
      { vaccineId: dose.vaccine.id, dose: dose.dose, reactions },
      Date.now(),
    ),
  )
}

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
  const choices: VaccineChoices = baby.vaccinePlan ?? DEFAULT_PLAN
  const setChoices = (next: VaccineChoices) =>
    setVaccinePlan(store, baby.id, {
      region: baby.vaccinePlan?.region ?? DEFAULT_PLAN.region,
      picked: { ...next.picked },
      selfPaid: [...next.selfPaid],
    })
  const [recording, setRecording] = useState<PlannedDose | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
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
                for (const dose of past) recordDose(store, baby.id, dose, dose.dueDay, [])
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

      <Choices choices={choices} disabled={!canLog} onChange={setChoices} />
      <VaccineReminders baby={baby} />
      <p className="m-0 text-caption text-muted-foreground">{m.vaccineSource()}</p>

      <RecordSheet
        dose={recording}
        today={today}
        onClose={() => setRecording(null)}
        onSave={(dose, day, reactions) => {
          recordDose(store, baby.id, dose, day, reactions)
          setRecording(null)
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
      ? m.vaccineGivenOn({ date: showDay(dose.givenDay) })
      : dose.state === 'replaced' && dose.replacedBy
        ? m.vaccineReplacedBy({ name: dose.replacedBy })
        : `${ageLabel(dose)} · ${showDay(dose.dueDay)}`
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
        <span className="truncate text-caption text-muted-foreground">{detail}</span>
      </span>
      {badge}
    </button>
  )
}

/** Which kind for the vaccines with a choice, and which self-paid ones to plan. */
function Choices({
  choices,
  disabled,
  onChange,
}: {
  choices: VaccineChoices
  disabled: boolean
  onChange: (choices: VaccineChoices) => void
}) {
  const groups = [...new Set(VACCINES.flatMap((vaccine) => vaccine.choice?.group ?? []))]
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 px-1 text-body font-extrabold">{m.vaccineChoices()}</h2>
      <Card className="flex flex-col gap-4">
        {groups.map((group) => {
          const options = VACCINES.filter((vaccine) => vaccine.choice?.group === group)
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
        <div className="flex flex-col gap-2">
          <span className="font-bold">{m.vaccineSelfPaid()}</span>
          <div className="flex flex-wrap gap-2">
            {VACCINES.filter((vaccine) => vaccine.programme === 'self-paid').map((vaccine) => {
              const on = choices.selfPaid.includes(vaccine.id)
              return (
                <ToggleChip
                  key={vaccine.id}
                  pressed={on}
                  disabled={disabled}
                  className="min-h-touch rounded-full px-4 font-extrabold"
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
                </ToggleChip>
              )
            })}
          </div>
        </div>
      </Card>
    </section>
  )
}

function RecordSheet({
  dose,
  today,
  onClose,
  onSave,
}: {
  dose: PlannedDose | null
  today: string
  onClose: () => void
  onSave: (dose: PlannedDose, day: string, reactions: VaccineReaction[]) => void
}) {
  const [day, setDay] = useState(today)
  const [reactions, setReactions] = useState<VaccineReaction[]>([])
  return (
    <Sheet open={dose !== null} onClose={onClose} title={m.vaccineRecord()}>
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
              <span className="text-caption text-muted-foreground">{dose.vaccine.against}</span>
            </span>
          </div>
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
              setDay(today)
              setReactions([])
            }}
          >
            {m.actionSave()}
          </Button>
        </div>
      )}
    </Sheet>
  )
}
