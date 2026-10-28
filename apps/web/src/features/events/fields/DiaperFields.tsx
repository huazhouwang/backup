import type { DiaperEvent, PeeDetails, PoopDetails } from '@lullabo/shared'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { ToggleChip } from '@lullabo/ui/toggle-chip'
import type { ReactNode } from 'react'

import { m } from '../../../paraglide/messages.js'
import { DiaperIcon } from '../DiaperArt'
import { amountLabel, poopColorLabel, poopConsistencyLabel } from '../labels'

export type DiaperData = DiaperEvent['data']
type Contents = DiaperData['contents']

export const DEFAULT_PEE: PeeDetails = { amount: 'normal' }
const DEFAULT_POOP: PoopDetails = {
  amount: 'normal',
  color: 'yellow',
  consistency: 'soft',
  curds: false,
}

/** Colors worth a doctor's look when they keep appearing. */
const WARNING_COLORS: ReadonlySet<PoopDetails['color']> = new Set(['black', 'red', 'white'])

const contentsOptions: { value: Contents; label: () => string }[] = [
  { value: 'wet', label: m.diaperWet },
  { value: 'dirty', label: m.diaperDirty },
  { value: 'mixed', label: m.diaperMixed },
]

function ChoiceCard({
  selected,
  label,
  onClick,
  children,
}: {
  selected: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <ToggleChip
      pressed={selected}
      tone="diaper"
      tintText={false}
      onClick={onClick}
      className="relative flex flex-col items-center gap-1 rounded-xl px-2 pt-2 pb-3 font-extrabold"
    >
      {selected && (
        <span
          aria-hidden
          className="absolute -top-1.5 -right-1.5 flex size-7 items-center justify-center rounded-full bg-diaper text-primary-foreground"
        >
          <svg viewBox="0 0 24 24" className="size-4">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      {children}
      <span>{label}</span>
    </ToggleChip>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="m-0 text-caption font-bold text-diaper-text">{children}</h3>
}

/** Diaper type cards and, for diapers with poop, amount, color and consistency. */
export function DiaperFields({
  value,
  onChange,
}: {
  value: DiaperData
  onChange: (value: DiaperData) => void
}) {
  const pee = value.pee ?? DEFAULT_PEE
  const poop = value.poop ?? DEFAULT_POOP
  const hasPee = value.contents !== 'dirty'
  const hasPoop = value.contents !== 'wet'
  // Each kind of contents carries only the details that apply to it.
  const setContents = (contents: Contents) =>
    onChange(
      contents === 'wet'
        ? { contents, pee }
        : contents === 'dirty'
          ? { contents, poop }
          : { contents, pee, poop },
    )
  const setPee = (patch: Partial<PeeDetails>) => onChange({ ...value, pee: { ...pee, ...patch } })
  const setPoop = (patch: Partial<PoopDetails>) =>
    onChange({ ...value, poop: { ...poop, ...patch } })

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <SectionLabel>{m.diaperType()}</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          {contentsOptions.map((option) => (
            <ChoiceCard
              key={option.value}
              selected={value.contents === option.value}
              label={option.label()}
              onClick={() => setContents(option.value)}
            >
              <DiaperIcon
                className="h-14 w-full"
                wet={option.value !== 'dirty'}
                poop={option.value === 'wet' ? undefined : 'yellow'}
              />
            </ChoiceCard>
          ))}
        </div>
      </section>

      {hasPee && (
        <section className="flex flex-col gap-4">
          <SectionLabel>{m.peeSection()}</SectionLabel>
          <SegmentedControl<PeeDetails['amount']>
            labelStyle="caption"
            label={m.peeAmount()}
            options={(['small', 'normal', 'large'] as const).map((amount) => ({
              value: amount,
              label: amountLabel[amount](),
            }))}
            value={pee.amount}
            onChange={(amount) => setPee({ amount })}
          />
        </section>
      )}

      {hasPoop && (
        <section className="flex flex-col gap-4">
          <SectionLabel>{m.poopSection()}</SectionLabel>
          <SegmentedControl<PoopDetails['amount']>
            labelStyle="caption"
            label={m.poopAmount()}
            options={(['small', 'normal', 'large'] as const).map((amount) => ({
              value: amount,
              label: amountLabel[amount](),
            }))}
            value={poop.amount}
            onChange={(amount) => setPoop({ amount })}
          />
          <div className="flex flex-col gap-2">
            <span className="text-caption font-bold text-muted-foreground">{m.poopColor()}</span>
            <div className="grid grid-cols-3 gap-3">
              {(['yellow', 'brown', 'green', 'black', 'red', 'white'] as const).map((color) => (
                <ChoiceCard
                  key={color}
                  selected={poop.color === color}
                  label={poopColorLabel[color]()}
                  onClick={() => setPoop({ color })}
                >
                  <DiaperIcon className="h-14 w-full" poop={color} />
                </ChoiceCard>
              ))}
            </div>
            {WARNING_COLORS.has(poop.color) && (
              <p className="m-0 text-caption font-bold text-destructive-text">
                {m.poopColorWarning()}
              </p>
            )}
          </div>
          <SegmentedControl<PoopDetails['consistency']>
            labelStyle="caption"
            label={m.poopConsistency()}
            options={(['watery', 'soft', 'hard'] as const).map((consistency) => ({
              value: consistency,
              label: poopConsistencyLabel[consistency](),
            }))}
            value={poop.consistency}
            onChange={(consistency) => setPoop({ consistency })}
          />
          <SegmentedControl<'no' | 'yes'>
            labelStyle="caption"
            label={m.poopCurds()}
            options={[
              { value: 'no', label: m.poopCurdsNo() },
              { value: 'yes', label: m.poopCurdsYes() },
            ]}
            value={poop.curds ? 'yes' : 'no'}
            onChange={(curds) => setPoop({ curds: curds === 'yes' })}
          />
        </section>
      )}
    </div>
  )
}
