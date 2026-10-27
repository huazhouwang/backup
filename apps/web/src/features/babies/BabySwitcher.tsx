import {
  type AvatarColor,
  type FamilySummary,
  familyDisplayName,
  localDateString,
} from '@lullabo/shared'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Sheet } from '../../components/ui/Sheet'
import { useLocalStore } from '../../db'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { useBabiesWithRunningTimers } from '../events/use-events'
import { createBaby } from './actions'
import { ageLabel } from './age-label'
import { BabyAvatar } from './BabyAvatar'
import { BabyForm } from './BabyForm'
import { BabyOptions } from './BabyOptions'
import { nextAvatarColor } from './records'
import { selectBaby, useBabies, useSelectedBaby } from './use-babies'

/** Top bar showing the selected baby; tapping it opens the baby picker. */
export function BabySwitcher() {
  const { active } = useBabies()
  const { baby, select } = useSelectedBaby()
  const runningBabies = useBabiesWithRunningTimers()
  const { access, babyFamilies } = useAccess()
  const otherRunning = active.some((b) => b.id !== baby?.id && runningBabies.has(b.id))
  const [sheet, setSheet] = useState<'closed' | 'pick' | 'add'>('closed')
  const close = () => setSheet('closed')

  if (!baby) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setSheet('pick')}
        aria-label={m.babySwitcherLabel({ name: baby.name })}
        className="mb-4 flex min-h-touch w-full items-center gap-3 press rounded-xl border-2 border-b-4 border-border px-3 py-2 text-left"
      >
        <span className="relative">
          <BabyAvatar name={baby.name} color={baby.avatarColor} />
          {otherRunning && (
            // Another baby has a timer running; the picker shows which one.
            <span className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full border-2 border-bg bg-danger" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-extrabold">{baby.name}</span>
          <span className="text-caption text-fg-muted">{ageLabel(baby.birthDate)}</span>
        </span>
        {active.length > 1 && (
          <svg aria-hidden viewBox="0 0 24 24" className="size-6 text-fg-muted">
            <path
              d="M7 9l5-5 5 5M7 15l5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <Sheet open={sheet === 'pick'} onClose={close} title={m.babySwitcherTitle()}>
        <BabyOptions
          babies={active}
          selectedId={baby.id}
          onSelect={(id) => {
            select(id)
            close()
          }}
          badges={
            new Map(
              [...runningBabies].map((id) => [id, { label: m.timerRunning(), tone: 'danger' }]),
            )
          }
        />
        <Button variant="soft" tone="primary" block onClick={() => setSheet('add')}>
          {m.babyAddTitle()}
        </Button>
      </Sheet>

      <Sheet open={sheet === 'add'} onClose={close} title={m.babyAddTitle()}>
        {sheet === 'add' && (
          <AddBaby
            choices={babyFamilies.choices}
            preferred={babyFamilies.preferred}
            access={access}
            nextColor={nextAvatarColor(active)}
            onCancel={close}
            onAdded={(id) => {
              selectBaby(id)
              close()
            }}
          />
        )}
      </Sheet>
    </>
  )
}

const NEW_FAMILY = 'new'

/** The baby form, with a choice of family when the user can add babies to more than one. */
function AddBaby({
  choices,
  preferred,
  access,
  nextColor,
  onCancel,
  onAdded,
}: {
  choices: readonly (string | null)[]
  preferred: string | null
  access: readonly FamilySummary[] | undefined
  nextColor: AvatarColor
  onCancel: () => void
  onAdded: (id: string) => void
}) {
  const store = useLocalStore()
  const [familyId, setFamilyId] = useState(preferred)
  const label = (id: string | null) => {
    const family = access?.find((item) => item.id === id)
    return family ? familyDisplayName(family) : m.familyNewOwn()
  }
  return (
    <div className="flex flex-col gap-4">
      {choices.length > 1 && (
        <SegmentedControl<string>
          labelStyle="field"
          label={m.babyFamilyLabel()}
          options={choices.map((id) => ({ value: id ?? NEW_FAMILY, label: label(id) }))}
          value={familyId ?? NEW_FAMILY}
          onChange={(value) => setFamilyId(value === NEW_FAMILY ? null : value)}
        />
      )}
      <BabyForm
        initial={{
          name: '',
          birthDate: localDateString(),
          sex: 'unspecified',
          avatarColor: nextColor,
        }}
        submitLabel={m.babyAddTitle()}
        onCancel={onCancel}
        onSubmit={(input) => onAdded(createBaby(store, input, familyId).id)}
      />
    </div>
  )
}
