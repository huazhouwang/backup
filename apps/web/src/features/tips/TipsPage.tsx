import { type Baby, ageNorms, babyAge, localDateString } from '@bobo/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { useRef } from 'react'

import { Card, CardTitle } from '../../components/ui/Card'
import { CheckIcon } from '../../components/ui/CheckIcon'
import { Chevron } from '../../components/ui/Chevron'
import { useConfetti } from '../../components/ui/Confetti'
import { ChipGroup } from '../../components/ui/ToggleChip'
import { TopicIcon } from '../../components/ui/TopicIcon'
import { playCue } from '../../lib/cues'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { useBabyEvents } from '../events/use-events'
import { typingDots } from '../voice/ChangingText'
import { tipsQueries } from './api'
import { type Comparison, compareWithUsual } from './compare'
import { tipById } from './library'
import { useMilestoneChecks } from './milestone-checks'
import { STAGES, type Stage, doctorSignsFor, milestonesFor, stageFor } from './stages'
import { TOPIC_STYLE } from './topic-style'

/**
 * What to expect at the baby's stage, from birth to 24 months: the stage's summary, Bobo's
 * observation and the baby's records next to what is usual (both for the current stage only),
 * usual feeding and sleep, milestones, tips and when to see a doctor. Other stages can be
 * browsed from the chips.
 */
export function TipsPage({
  baby,
  stageId,
  onStage,
}: {
  baby: Baby
  stageId: string | undefined
  onStage: (id: string) => void
}) {
  const now = useNow(60_000)
  const today = localDateString(now)
  const current = stageFor(babyAge(baby.birthDate, today))
  const stage = STAGES.find((item) => item.id === stageId) ?? current
  const isCurrent = stage.id === current.id

  return (
    <div className="flex flex-col gap-5">
      <ChipGroup<string>
        legend={m.tipsStages()}
        showLegend={false}
        options={STAGES.map((item) => item.id)}
        value={stage.id}
        onChange={onStage}
        optionLabel={(id) => STAGES.find((item) => item.id === id)?.label ?? id}
      />
      <Card tone="primary" as="section" className="flex flex-col gap-1.5">
        <CardTitle small>
          {isCurrent ? m.tipsThisStageNow() : m.tipsThisStage({ stage: stage.label })}
        </CardTitle>
        <p className="m-0">{stage.summary}</p>
      </Card>
      {isCurrent && <Observation baby={baby} day={today} />}
      {isCurrent && <Records baby={baby} now={now} />}
      <Usual stage={stage} />
      <Milestones stage={stage} babyId={baby.id} />
      <Tips stage={stage} />
      <Doctor stage={stage} />
      <p className="m-0 text-caption text-fg-muted">{m.tipsSources()}</p>
    </div>
  )
}

/** Bobo's observation on the week: signed in only, as the family's AI writes it. */
function Observation({ baby, day }: { baby: Baby; day: string }) {
  const { userId } = useAccess()
  const { data, isPending, isError } = useQuery({
    ...tipsQueries.observation(baby.id, day),
    enabled: Boolean(userId),
  })
  const reason = data && data.text === null ? data.reason : null
  if (!userId || isError || reason === 'failed' || reason === 'limited') return null
  return (
    <Card as="section" className="flex flex-col gap-2">
      <CardTitle small>{m.tipsObservationTitle()}</CardTitle>
      {isPending ? (
        <p className="m-0 flex items-center gap-2 text-fg-muted">
          {typingDots}
          {m.tipsObservationLoading()}
        </p>
      ) : data?.text ? (
        <>
          <p className="m-0">{data.text}</p>
          <p className="m-0 text-caption text-fg-muted">{m.tipsObservationAi()}</p>
        </>
      ) : reason === 'noAi' ? (
        <p className="m-0 text-fg-muted">
          {m.tipsObservationNoAi()}{' '}
          <Link to="/settings/ai" className="font-bold text-primary-text">
            {m.tipsObservationSetUp()}
          </Link>
        </p>
      ) : (
        <p className="m-0 text-fg-muted">{m.tipsObservationSparse()}</p>
      )}
    </Card>
  )
}

const verdictLabel = {
  usual: m.tipsVerdictUsual,
  below: m.tipsVerdictBelow,
  above: m.tipsVerdictAbove,
}

function ComparisonRow({ item }: { item: Comparison }) {
  const [low, high] = item.usual
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-extrabold">
          {item.kind === 'milk'
            ? m.tipsRecordsMilk({ ml: item.value })
            : m.tipsRecordsSleep({ hours: item.value })}
        </span>
        <span className="text-caption text-fg-muted">
          {m.tipsRecordsUsual({ low, high, days: item.days })}
          {item.verdict === 'below' && ` ${m.tipsVerdictBelowHint()}`}
        </span>
      </div>
      <span
        className={clsx(
          'shrink-0 rounded-full px-2.5 py-1 text-caption font-extrabold',
          item.verdict === 'usual'
            ? 'bg-primary-soft text-primary-text'
            : 'bg-medication-soft text-medication-text',
        )}
      >
        {verdictLabel[item.verdict]()}
      </span>
    </li>
  )
}

/** The last week's records next to the usual range, when enough of it was logged. */
function Records({ baby, now }: { baby: Baby; now: number }) {
  const events = useBabyEvents(baby.id)
  const months = babyAge(baby.birthDate, localDateString(now)).totalDays / 30.44
  const comparisons = compareWithUsual(events, months, now)
  return (
    <Card as="section" className="flex flex-col gap-1">
      <CardTitle small>{m.tipsRecordsTitle()}</CardTitle>
      {comparisons.length > 0 ? (
        <ul className="m-0 flex list-none flex-col divide-y-2 divide-border p-0">
          {comparisons.map((item) => (
            <ComparisonRow key={item.kind} item={item} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-fg-muted">{m.tipsRecordsNone()}</p>
      )}
    </Card>
  )
}

/** Usual feeding and sleep at the stage. */
function Usual({ stage }: { stage: Stage }) {
  const usual = ageNorms(stage.months)
  const lines = [
    m.tipsUsualMilk({ low: usual.milkMlPerDay[0], high: usual.milkMlPerDay[1] }),
    m.tipsUsualFeeds({ low: usual.feedsPerDay[0], high: usual.feedsPerDay[1] }),
    m.tipsUsualSleep({ low: usual.sleepHoursPerDay[0], high: usual.sleepHoursPerDay[1] }),
    m.tipsUsualAwake({ low: usual.wakeMinutes[0], high: usual.wakeMinutes[1] }),
  ]
  return (
    <section className="flex flex-col gap-2">
      <CardTitle small>{m.tipsUsualTitle()}</CardTitle>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}

/** What most babies do by the next checkpoint; tapping one ticks it off (on this device). */
function Milestones({ stage, babyId }: { stage: Stage; babyId: string }) {
  const checkpoint = milestonesFor(stage)
  const { isChecked, toggle } = useMilestoneChecks(babyId)
  const { confetti, fire } = useConfetti()
  const list = useRef<HTMLDivElement>(null)
  const allDone = checkpoint.items.every(isChecked)
  // Ticking one off dings; ticking off the last one celebrates.
  const tick = (item: string) => {
    const ticking = !isChecked(item)
    toggle(item)
    if (!ticking) return
    if (checkpoint.items.every((other) => other === item || isChecked(other))) {
      playCue('celebrate')
      fire(list.current)
    } else playCue('tick')
  }
  return (
    <section className="flex flex-col gap-2">
      <CardTitle small>{m.tipsMilestonesTitle({ months: checkpoint.by })}</CardTitle>
      {/* All ticked off: confetti bursts out from behind the list. */}
      <div ref={list} className="relative">
        <Card className="relative z-10 overflow-hidden px-0 py-0">
          <ul className="m-0 flex list-none flex-col p-0">
            {checkpoint.items.map((item, index) => {
              const ticked = isChecked(item)
              const above = index > 0 && isChecked(checkpoint.items[index - 1] ?? '')
              return (
                <li key={item}>
                  {/* The colour change parts a ticked row from the rest; two ticked rows get
                    a faint green line across, two plain ones the usual divider. */}
                  {index > 0 && (
                    <span
                      aria-hidden
                      className={clsx(
                        'block h-0.5',
                        ticked && above
                          ? 'bg-primary/20'
                          : ticked || above
                            ? 'bg-transparent'
                            : 'mx-4 bg-border',
                      )}
                    />
                  )}
                  <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-2 font-bold transition-colors has-checked:bg-primary-soft has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-primary">
                    {item}
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={ticked}
                      onChange={() => tick(item)}
                    />
                    {/* Ticked: the row turns light green, with a dark green tick. */}
                    <CheckIcon className="hidden size-6 text-primary-text peer-checked:block" />
                  </label>
                </li>
              )
            })}
          </ul>
        </Card>
        {confetti}
      </div>
      <p className="m-0 text-caption text-fg-muted">{m.tipsMilestonesNote()}</p>
      <p className="sr-only" aria-live="polite">
        {allDone ? m.tipsMilestonesDone() : ''}
      </p>
    </section>
  )
}

function Tips({ stage }: { stage: Stage }) {
  const tips = stage.tips.flatMap((id) => tipById(id) ?? [])
  return (
    <section className="flex flex-col gap-2">
      <CardTitle small>{m.tipsTipsTitle()}</CardTitle>
      {tips.map((tip) => {
        const style = TOPIC_STYLE[tip.topic]
        return (
          <Link
            key={tip.id}
            to="/tips/$tipId"
            params={{ tipId: tip.id }}
            className={clsx(
              'press flex items-center gap-3 rounded-xl border-2 border-b-4 p-3',
              style.card,
            )}
          >
            <TopicIcon topic={tip.topic} className={clsx('size-10', style.icon)} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={clsx('font-extrabold', style.text)}>{tip.title}</span>
              <span className="text-caption text-fg-muted">{tip.teaser}</span>
            </span>
            <Chevron className={clsx('size-5', style.text)} />
          </Link>
        )
      })}
    </section>
  )
}

function Doctor({ stage }: { stage: Stage }) {
  const signs = doctorSignsFor(stage)
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-danger-soft p-4">
      <h2 className="m-0 text-body font-extrabold text-danger-text">{m.tipsDoctorTitle()}</h2>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-danger-text">
        {signs.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
