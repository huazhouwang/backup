import { Button } from '@lullabo/ui/button'
import { Input } from '@lullabo/ui/input'
import { SegmentedControl } from '@lullabo/ui/segmented-control'

import { getUnits, inputValue, quantityInputProps, unitLabel } from '../../../lib/units'
import { m } from '../../../paraglide/messages.js'
import { milkLabel, optionsOf, sideLabel } from '../labels'
import type { BottleDraft, MedicationDraft, PumpingDraft } from './drafts'
import { showsMixedParts } from './drafts'
import type { GrowthDraft, GrowthErrors } from './growth-input'
import { MixedAmounts } from './MixedAmounts'

/** Per-type fields shared by the logging and editing forms. */

/** One-tap bottle amounts in display units. */
const QUICK_AMOUNTS = { ml: [60, 90, 120, 150], oz: [2, 3, 4, 5] } as const

export function BottleFields({
  value,
  onChange,
  error,
  editing = false,
}: {
  value: BottleDraft
  onChange: (value: BottleDraft) => void
  error?: string
  /**
   * Editing a stored bottle: mixed bottles saved with only a total keep it (with a button to
   * split it). New bottles get one-tap amounts instead.
   */
  editing?: boolean
}) {
  const set = (patch: Partial<BottleDraft>) => onChange({ ...value, ...patch })
  return (
    <>
      <SegmentedControl
        labelStyle="field"
        label={m.bottleMilk()}
        options={optionsOf(milkLabel, ['formula', 'breast', 'mixed'])}
        value={value.milk}
        onChange={(milk) => set({ milk })}
      />
      {showsMixedParts(value, editing) ? (
        <MixedAmounts
          breast={value.breast}
          formula={value.formula}
          error={error}
          onBreast={(breast) => set({ breast })}
          onFormula={(formula) => set({ formula })}
        />
      ) : (
        <>
          <Input
            label={m.bottleAmount({ unit: unitLabel('volume') })}
            {...quantityInputProps('volume')}
            min={0}
            value={value.amount}
            error={error}
            onChange={(event) => set({ amount: event.target.value })}
          />
          {value.milk === 'mixed' && (
            // A mixed bottle logged with only its total: start the split from it.
            <Button
              variant="ghost"
              tone="feeding"
              onClick={() => set({ breast: '0', formula: value.amount })}
            >
              {m.mixedSplitAction()}
            </Button>
          )}
          {!editing && (
            <div className="grid grid-cols-4 gap-2">
              {QUICK_AMOUNTS[getUnits().volume].map((amount) => (
                <Button
                  key={amount}
                  variant={value.amount === String(amount) ? 'default' : 'soft'}
                  tone="feeding"
                  aria-pressed={value.amount === String(amount)}
                  onClick={() => set({ amount: String(amount) })}
                >
                  {amount}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

export function SolidsField({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <Input
      label={m.solidsFood()}
      placeholder={m.solidsFoodPlaceholder()}
      value={value}
      maxLength={100}
      error={error}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function PumpingFields({
  value,
  onChange,
  error,
}: {
  value: PumpingDraft
  onChange: (value: PumpingDraft) => void
  error?: string
}) {
  return (
    <>
      <SegmentedControl
        label={m.pumpingSide()}
        options={optionsOf(sideLabel, ['left', 'right', 'both'])}
        value={value.side}
        onChange={(side) => onChange({ ...value, side })}
      />
      <Input
        label={m.pumpingAmount({ unit: unitLabel('volume') })}
        {...quantityInputProps('volume')}
        min={0}
        value={value.amount}
        error={error}
        onChange={(event) => onChange({ ...value, amount: event.target.value })}
      />
    </>
  )
}

export function TemperatureField({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <Input
      label={m.temperatureLabel({ unit: unitLabel('temperature') })}
      {...quantityInputProps('temperature')}
      placeholder={inputValue('temperature', 36.8)}
      value={value}
      error={error}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function MedicationFields({
  value,
  onChange,
  error,
}: {
  value: MedicationDraft
  onChange: (value: MedicationDraft) => void
  error?: string
}) {
  return (
    <>
      <Input
        label={m.medicationName()}
        value={value.name}
        maxLength={100}
        error={error}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
      />
      <Input
        label={m.medicationDose()}
        placeholder={m.medicationDosePlaceholder()}
        value={value.dose}
        maxLength={50}
        onChange={(event) => onChange({ ...value, dose: event.target.value })}
      />
    </>
  )
}

export function GrowthFields({
  value,
  onChange,
  errors,
}: {
  value: GrowthDraft
  onChange: (value: GrowthDraft) => void
  errors: GrowthErrors
}) {
  const field = (key: keyof GrowthDraft) => ({
    value: value[key],
    error: errors[key],
    onChange: (event: { target: { value: string } }) =>
      onChange({ ...value, [key]: event.target.value }),
  })
  return (
    <>
      <Input
        label={m.growthWeight({ unit: unitLabel('weight') })}
        {...quantityInputProps('weight')}
        {...field('weight')}
      />
      <Input
        label={m.growthLength({ unit: unitLabel('length') })}
        {...quantityInputProps('length')}
        {...field('length')}
      />
      <Input
        label={m.growthHead({ unit: unitLabel('length') })}
        {...quantityInputProps('length')}
        {...field('head')}
      />
    </>
  )
}
