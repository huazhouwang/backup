import {
  type Baby,
  HOUR,
  type PlannedDose,
  localDateString,
  parseDay,
  vaccineById,
} from '@lullabo/shared'
import { Button } from '@lullabo/ui/button'
import { Card } from '@lullabo/ui/card'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { ToggleChip } from '@lullabo/ui/toggle-chip'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { Chevron } from '../../components/icons/Chevron'
import { formatDate, formatNumber, formatTime } from '../../lib/i18n'
import { formatQuantity, unitLabel, useUnits } from '../../lib/units'
import { m } from '../../paraglide/messages.js'
import { ageLabel } from '../babies/age-label'
import { useBabyEvents } from '../events/use-events'
import { FEVER_CELSIUS, REPORT_DAYS, type ReportDays, buildReport, isReportDays } from './report'

const showDay = (day: string, withYear = false) => {
  const { year, month, day: date } = parseDay(day)
  return formatDate(new Date(year, month - 1, date), {
    ...(withYear ? { year: 'numeric' } : {}),
    month: 'long',
    day: 'numeric',
  })
}
const showAt = (at: number) => `${showDay(localDateString(at))} ${formatTime(at)}`
const hours = (ms: number) => formatNumber(ms / HOUR, { maximumFractionDigits: 1 })
const one = (value: number) => formatNumber(value, { maximumFractionDigits: 1 })

const SEX = { female: m.sexFemale, male: m.sexMale, unspecified: () => '' } as const
const POOP_COLOUR: Record<string, () => string> = {
  black: m.reportPoopBlack,
  red: m.reportPoopRed,
  white: m.reportPoopWhite,
}
const MEASURE = {
  weight: { title: m.reportWeight, quantity: 'weight' },
  length: { title: m.reportLength, quantity: 'length' },
  head: { title: m.reportHead, quantity: 'length' },
} as const

const doseName = (dose: PlannedDose) => `${dose.vaccine.name} ${m.vaccineDose({ dose: dose.dose })}`

/**
 * One page for the doctor: the last days' feeding, sleep and diapers on average and day by
 * day, what needs a look (fever, poop), medicines, growth and vaccinations. Printed or saved
 * as a PDF from the browser; the controls stay off the paper.
 */
export function ReportPage({
  baby,
  days,
  withNotes,
  onDays,
  onNotes,
}: {
  baby: Baby
  days: ReportDays
  withNotes: boolean
  onDays: (days: ReportDays) => void
  onNotes: (withNotes: boolean) => void
}) {
  const events = useBabyEvents(baby.id)
  const units = useUnits()
  // The report is of now; it is built again with each render, like the day's totals.
  // oxlint-disable-next-line react/purity
  const now = Date.now()
  const report = buildReport(baby, events, days, now)
  const volume = (ml: number) =>
    `${formatQuantity('volume', ml, units)} ${unitLabel('volume', units)}`
  const temperature = (celsius: number) =>
    `${formatQuantity('temperature', celsius, units)} ${unitLabel('temperature', units)}`
  const fevers = report.temperatures.filter((reading) => reading.celsius >= FEVER_CELSIUS)
  const colours = Object.entries(report.poopFlags.color)
  const watch = [
    ...(fevers.length > 0
      ? [
          m.reportFever({
            count: fevers.length,
            max: temperature(Math.max(...fevers.map((reading) => reading.celsius))),
          }),
        ]
      : []),
    ...colours.map(([colour, count]) =>
      m.reportPoopColour({ colour: POOP_COLOUR[colour]?.() ?? colour, count }),
    ),
    ...(report.poopFlags.watery > 0 ? [m.reportWatery({ count: report.poopFlags.watery })] : []),
    ...(report.poopFlags.curds > 0 ? [m.reportCurds({ count: report.poopFlags.curds })] : []),
  ]
  const average = report.averages

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 print:hidden">
        <Link
          to="/"
          className="flex min-h-touch items-center gap-1 self-start font-bold text-muted-foreground"
        >
          <Chevron direction="left" />
          {m.tabToday()}
        </Link>
        <h1 className="m-0 text-display font-extrabold">{m.reportTitle()}</h1>
        <Card className="flex flex-col gap-4">
          <SegmentedControl<`${ReportDays}`>
            label={m.reportPeriod()}
            labelStyle="field"
            options={REPORT_DAYS.map((count) => ({
              value: `${count}`,
              label: m.reportDays({ days: count }),
            }))}
            value={`${days}`}
            onChange={(value) => {
              const next = Number(value)
              if (isReportDays(next)) onDays(next)
            }}
          />
          <ToggleChip
            pressed={withNotes}
            className="min-h-touch self-start rounded-full px-4 font-extrabold"
            onClick={() => onNotes(!withNotes)}
          >
            {m.reportWithNotes()}
          </ToggleChip>
          <Button size="lg" block onClick={() => window.print()}>
            {m.reportPrint()}
          </Button>
          <p className="m-0 text-caption text-muted-foreground">{m.reportPrintHint()}</p>
        </Card>
      </div>

      <article className="flex flex-col gap-5 rounded-xl border-2 border-border bg-white p-5 text-[15px] leading-snug text-black print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-col gap-1 border-b-2 border-black/15 pb-3">
          <h2 className="m-0 text-title font-extrabold">{m.reportHeading({ name: baby.name })}</h2>
          <p className="m-0">
            {[
              SEX[baby.sex](),
              m.reportBorn({ date: showDay(baby.birthDate, true) }),
              ageLabel(baby.birthDate),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="m-0 text-black/60">
            {m.reportRange({
              from: showDay(report.from),
              to: showDay(report.to),
              logged: report.loggedDays,
              days,
            })}
          </p>
        </header>

        <Part title={m.reportAverages()}>
          {average ? (
            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2">
              <Stat label={m.reportFeeds()}>
                {m.reportPerDay({ value: one(average.feedings) })}
                {average.feedIntervalMs !== null &&
                  ` · ${m.reportEvery({ hours: hours(average.feedIntervalMs) })}`}
              </Stat>
              {average.bottleMl > 0 && (
                <Stat label={m.reportBottle()}>
                  {m.reportPerDay({ value: volume(average.bottleMl) })}
                </Stat>
              )}
              {average.breastMinutes > 0 && (
                <Stat label={m.reportBreast()}>
                  {m.reportMinutesPerDay({ minutes: Math.round(average.breastMinutes) })}
                </Stat>
              )}
              <Stat label={m.reportSleep()}>
                {m.reportHoursPerDay({ hours: hours(average.sleepMs) })}
              </Stat>
              <Stat label={m.reportLongestSleep()}>
                {m.reportHours({ hours: hours(average.longestSleepMs) })}
              </Stat>
              <Stat label={m.reportWet()}>{m.reportPerDay({ value: one(average.wet) })}</Stat>
              <Stat label={m.reportDirty()}>{m.reportPerDay({ value: one(average.dirty) })}</Stat>
            </dl>
          ) : (
            <p className="m-0 text-black/60">{m.reportNothing()}</p>
          )}
        </Part>

        <Part title={m.reportWatch()}>
          {watch.length > 0 ? (
            <ul className="m-0 flex flex-col gap-1 pl-5">
              {watch.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-black/60">{m.reportWatchNone()}</p>
          )}
        </Part>

        {report.temperatures.length > 0 && (
          <Part title={m.reportTemperatures()}>
            <List
              rows={report.temperatures.map((reading) => [
                showAt(reading.at),
                temperature(reading.celsius),
              ])}
            />
          </Part>
        )}

        {report.medications.length > 0 && (
          <Part title={m.reportMedicines()}>
            <List
              rows={report.medications.map((dose) => [
                showAt(dose.at),
                [dose.name, dose.dose].filter(Boolean).join(' '),
              ])}
            />
          </Part>
        )}

        {report.growth.length > 0 && (
          <Part title={m.reportGrowth()}>
            <List
              rows={report.growth.map((reading) => {
                const { title, quantity } = MEASURE[reading.measure]
                const value = `${formatQuantity(quantity, reading.value, units)} ${unitLabel(quantity, units)}`
                const percentile =
                  reading.percentile === undefined
                    ? ''
                    : ` · ${m.reportPercentile({ value: Math.round(reading.percentile) })}`
                const change = reading.previous
                  ? ` · ${m.reportChange({
                      change: `${reading.value >= reading.previous.value ? '+' : '−'}${formatQuantity(
                        quantity,
                        Math.abs(reading.value - reading.previous.value),
                        units,
                      )}`,
                      date: showDay(localDateString(reading.previous.at)),
                    })}`
                  : ''
                return [
                  title(),
                  `${value}${percentile}${change}（${showDay(localDateString(reading.at))}）`,
                ]
              })}
            />
          </Part>
        )}

        <Part title={m.reportVaccines()}>
          <List
            rows={[
              ...report.vaccinesGiven.map((event) => [
                showAt(event.startAt),
                `${vaccineById(event.data.vaccineId)?.name ?? event.data.name ?? event.data.vaccineId} ${m.vaccineDose({ dose: event.data.dose })}`,
              ]),
              ...report.vaccinesNext.map((dose) => [
                dose.state === 'overdue' ? m.reportVaccineLate() : showDay(dose.dueDay),
                doseName(dose),
              ]),
            ]}
            empty={m.reportVaccinesNone()}
          />
        </Part>

        <Part title={m.reportByDay()}>
          <table className="w-full border-collapse text-left text-[13px] tabular-nums">
            <thead>
              <tr className="border-b-2 border-black/15">
                <th className="py-1 font-bold">{m.reportDate()}</th>
                <th className="py-1 font-bold">{m.reportFeeds()}</th>
                <th className="py-1 font-bold">{unitLabel('volume', units)}</th>
                <th className="py-1 font-bold">{m.reportSleepHours()}</th>
                <th className="py-1 font-bold">{m.reportWetShort()}</th>
                <th className="py-1 font-bold">{m.reportDirtyShort()}</th>
              </tr>
            </thead>
            <tbody>
              {report.days.map((row) => (
                <tr key={row.day} className="border-b border-black/10">
                  <td className="py-1">{showDay(row.day)}</td>
                  {row.logged ? (
                    <>
                      <td className="py-1">{row.feedings}</td>
                      <td className="py-1">
                        {row.bottleMl > 0 ? formatQuantity('volume', row.bottleMl, units) : '–'}
                      </td>
                      <td className="py-1">{hours(row.sleepMs)}</td>
                      <td className="py-1">{row.wet}</td>
                      <td className="py-1">{row.dirty}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="py-1 text-black/50">
                      {m.reportNotLogged()}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Part>

        {withNotes && report.notes.length > 0 && (
          <Part title={m.reportNotes()}>
            <List rows={report.notes.map((note) => [showAt(note.at), note.text])} />
          </Part>
        )}

        <footer className="border-t-2 border-black/15 pt-3 text-[12px] text-black/60">
          {m.reportFooter({ date: showAt(now) })}
        </footer>
      </article>
    </div>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 break-inside-avoid">
      <h3 className="m-0 text-body font-extrabold">{title}</h3>
      {children}
    </section>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[12px] text-black/60">{label}</dt>
      <dd className="m-0 font-bold">{children}</dd>
    </div>
  )
}

function List({ rows, empty }: { rows: string[][]; empty?: string }) {
  if (rows.length === 0) return <p className="m-0 text-black/60">{empty}</p>
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map(([when, what]) => (
        <li key={`${when}${what}`} className="flex gap-3">
          <span className="w-32 shrink-0 text-black/60 tabular-nums">{when}</span>
          <span className="min-w-0 flex-1">{what}</span>
        </li>
      ))}
    </ul>
  )
}
