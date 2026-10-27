import { type AvatarColor, type BabySex, localDateString } from '@lullabo/shared'
import { clsx } from 'clsx'
import { type FormEvent, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { m } from '../../paraglide/messages.js'
import { avatarBackground } from './BabyAvatar'
import { AVATAR_COLORS, type BabyInput } from './records'

const colorNames: Record<AvatarColor, () => string> = {
  green: m.colorGreen,
  blue: m.colorBlue,
  orange: m.colorOrange,
  purple: m.colorPurple,
  pink: m.colorPink,
  yellow: m.colorYellow,
}

type Errors = Partial<Record<'name' | 'birthDate', string>>

function validate(input: BabyInput, today: string): Errors {
  const errors: Errors = {}
  if (!input.name.trim()) errors.name = m.babyFormNameRequired()
  if (!input.birthDate) errors.birthDate = m.babyFormBirthDateRequired()
  // ISO dates compare correctly as strings.
  else if (input.birthDate > today) errors.birthDate = m.babyFormBirthDateFuture()
  return errors
}

export interface BabyFormProps {
  initial: BabyInput
  submitLabel: string
  onSubmit: (input: BabyInput) => void
  onCancel?: () => void
}

export function BabyForm({ initial, submitLabel, onSubmit, onCancel }: BabyFormProps) {
  const [input, setInput] = useState(initial)
  const [errors, setErrors] = useState<Errors>({})
  const today = localDateString()

  const update = <K extends keyof BabyInput>(key: K, value: BabyInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }))

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validate(input, today)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) onSubmit({ ...input, name: input.name.trim() })
  }

  const sexOptions: { value: BabySex; label: string }[] = [
    { value: 'female', label: m.sexFemale() },
    { value: 'male', label: m.sexMale() },
    { value: 'unspecified', label: m.sexUnspecified() },
  ]

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={m.babyFormName()}
        placeholder={m.babyFormNamePlaceholder()}
        value={input.name}
        maxLength={40}
        autoComplete="off"
        error={errors.name}
        onChange={(event) => update('name', event.target.value)}
      />
      <Input
        label={m.babyFormBirthDate()}
        type="date"
        max={today}
        value={input.birthDate}
        error={errors.birthDate}
        onChange={(event) => update('birthDate', event.target.value)}
      />
      <SegmentedControl
        labelStyle="field"
        label={m.babyFormSex()}
        options={sexOptions}
        value={input.sex}
        onChange={(sex) => update('sex', sex)}
      />
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 font-bold">{m.babyFormColor()}</legend>
        <div className="grid max-w-80 grid-cols-6 gap-2">
          {AVATAR_COLORS.map((color) => (
            <label
              key={color}
              className={clsx(
                'aspect-square w-full cursor-pointer rounded-full border-4 border-bg outline-3 outline-transparent',
                'has-checked:outline-fg has-focus-visible:outline-diaper',
                avatarBackground[color],
              )}
            >
              <input
                type="radio"
                name="avatarColor"
                value={color}
                checked={input.avatarColor === color}
                onChange={() => update('avatarColor', color)}
                aria-label={colorNames[color]()}
                className="sr-only"
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-3 pt-2">
        {onCancel && (
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            {m.actionCancel()}
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
