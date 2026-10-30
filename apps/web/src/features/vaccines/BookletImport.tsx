import {
  type BookletDose,
  type VaccineChoices,
  type VaccineRegion,
  localDateString,
  vaccineById,
} from '@lullabo/shared'
import { Button } from '@lullabo/ui/button'
import { Card } from '@lullabo/ui/card'
import { Sheet } from '@lullabo/ui/sheet'
import { ToggleChip } from '@lullabo/ui/toggle-chip'
import { cn } from '@lullabo/ui/utils'
import { Link } from '@tanstack/react-router'
import { type ChangeEvent, useRef, useState } from 'react'

import { CameraIcon } from '../../components/icons/CameraIcon'
import { CheckIcon } from '../../components/icons/CheckIcon'
import { HttpError } from '../../lib/api'
import { m } from '../../paraglide/messages.js'
import { readBookletPhoto, shrinkPhoto } from './photo'

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; index: number; count: number }
  | { kind: 'review' }
  | { kind: 'noAi' }
  | { kind: 'failed' }

interface Read extends BookletDose {
  keep: boolean
}

const nameOf = (dose: BookletDose) =>
  (dose.vaccineId && vaccineById(dose.vaccineId)?.name) || dose.name

const keyOf = (dose: BookletDose) => `${dose.vaccineId ?? dose.name}:${dose.dose}`

/**
 * Photos of the vaccination booklet, read by the family's AI into the doses given: each
 * shown to check, its day put right or left out, before saving.
 */
export function BookletImport({
  babyId,
  plan,
  given,
  onSave,
}: {
  babyId: string
  plan: VaccineChoices
  /** "vaccine id:dose" of those on record. */
  given: ReadonlySet<string>
  onSave: (doses: BookletDose[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [read, setRead] = useState<Read[]>([])
  const today = localDateString()
  const onRecord = (dose: BookletDose) => dose.vaccineId !== null && given.has(keyOf(dose))

  const readPhotos = async (files: File[], region: VaccineRegion) => {
    const found: Read[] = []
    let unreadable = 0
    for (const [index, file] of files.entries()) {
      setPhase({ kind: 'reading', index: index + 1, count: files.length })
      try {
        // oxlint-disable-next-line no-await-in-loop -- one page at a time, as the progress says
        const doses = await readBookletPhoto(babyId, region, await shrinkPhoto(file))
        for (const dose of doses) {
          if (found.some((other) => keyOf(other) === keyOf(dose))) continue
          found.push({ ...dose, keep: !onRecord(dose) })
        }
      } catch (error) {
        if (error instanceof HttpError && error.status === 400) {
          setPhase({ kind: 'noAi' })
          return
        }
        unreadable += 1
      }
    }
    setRead((before) => [
      ...before,
      ...found.filter((dose) => !before.some((other) => keyOf(other) === keyOf(dose))),
    ])
    setPhase(
      unreadable === files.length && found.length === 0 ? { kind: 'failed' } : { kind: 'review' },
    )
  }

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length > 0) void readPhotos(files, plan.region)
  }
  const close = () => {
    setPhase({ kind: 'idle' })
    setRead([])
  }
  const kept = read.filter((dose) => dose.keep && !onRecord(dose))
  const update = (index: number, change: Partial<Read>) =>
    setRead((all) => all.map((dose, at) => (at === index ? { ...dose, ...change } : dose)))

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="press flex items-center gap-3 rounded-xl border-2 border-b-4 border-border bg-card p-4 text-left"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <CameraIcon className="size-7" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-extrabold">{m.vaccinePhoto()}</span>
          <span className="text-caption text-muted-foreground">{m.vaccinePhotoHint()}</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label={m.vaccinePhoto()}
        onChange={choose}
      />
      <Sheet open={phase.kind !== 'idle'} onClose={close} title={m.vaccinePhotoTitle()}>
        {phase.kind === 'reading' && (
          <p className="m-0 py-6 text-center font-bold text-muted-foreground" aria-live="polite">
            {m.vaccinePhotoReading({ index: phase.index, count: phase.count })}
          </p>
        )}
        {phase.kind === 'noAi' && (
          <Card className="flex flex-col gap-2">
            <p className="m-0">{m.vaccinePhotoNeedsAi()}</p>
            <Link to="/settings/ai" className="font-bold text-accent-foreground underline">
              {m.vaccinePhotoSetUpAi()}
            </Link>
          </Card>
        )}
        {phase.kind === 'failed' && <Card>{m.vaccinePhotoFailed()}</Card>}
        {phase.kind === 'review' && (
          <div className="flex flex-col gap-4">
            {read.length === 0 ? (
              <Card>{m.vaccinePhotoNone()}</Card>
            ) : (
              <>
                <p className="m-0 text-caption text-muted-foreground">{m.vaccinePhotoCheck()}</p>
                <Card className="flex flex-col py-1">
                  {read.map((dose, index) => {
                    const recorded = onRecord(dose)
                    return (
                      <div
                        key={keyOf(dose)}
                        className="flex items-center gap-3 border-b-2 border-border py-2 last:border-b-0"
                      >
                        <ToggleChip
                          pressed={dose.keep && !recorded}
                          disabled={recorded}
                          aria-label={`${nameOf(dose)} ${m.vaccineDose({ dose: dose.dose })}`}
                          className="flex size-10 shrink-0 items-center justify-center rounded-full p-0"
                          onClick={() => update(index, { keep: !dose.keep })}
                        >
                          <CheckIcon
                            className={cn('size-5', !(dose.keep && !recorded) && 'opacity-0')}
                          />
                        </ToggleChip>
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate font-extrabold">
                            {`${nameOf(dose)} ${m.vaccineDose({ dose: dose.dose })}`}
                          </span>
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="date"
                              aria-label={m.vaccineDate()}
                              max={today}
                              value={dose.date}
                              disabled={recorded}
                              onChange={(event) =>
                                event.target.value && update(index, { date: event.target.value })
                              }
                              className="h-8 shrink-0 rounded-md border-2 border-border bg-muted px-2 text-caption font-extrabold"
                            />
                            <span className="truncate text-caption text-muted-foreground">
                              {recorded
                                ? m.vaccinePhotoRecorded()
                                : dose.vaccineId
                                  ? (vaccineById(dose.vaccineId)?.local ?? dose.name)
                                  : m.vaccinePhotoCustom()}
                            </span>
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </Card>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => input.current?.click()}>
                {m.vaccinePhotoMore()}
              </Button>
              <Button
                disabled={kept.length === 0}
                onClick={() => {
                  onSave(kept.map(({ keep: _keep, ...dose }) => dose))
                  close()
                }}
              >
                {m.vaccinePhotoSave({ count: kept.length })}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}
