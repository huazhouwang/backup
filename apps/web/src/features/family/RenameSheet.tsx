import type { FamilySummary } from '@lullabo/shared'
import { Button } from '@lullabo/ui/button'
import { Input } from '@lullabo/ui/input'
import { Sheet } from '@lullabo/ui/sheet'
import { type FormEvent, useState } from 'react'

import { toastIfRefused } from '../../lib/server-collection'
import { m } from '../../paraglide/messages.js'
import { familyApi } from './api'
import { useUpdateFamily } from './use-update-family'

export function RenameSheet({
  family,
  open,
  onClose,
}: {
  family: FamilySummary
  open: boolean
  onClose: () => void
}) {
  const [name, setName] = useState(family.name)
  const updateFamily = useUpdateFamily()

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const change = updateFamily({
      familyId: family.id,
      patch: { name: trimmed },
      save: () => familyApi.rename(family.id, trimmed),
    })
    toastIfRefused(change, m.actionFailed())
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={m.familyRename()}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label={m.familyNameLabel()}
          value={name}
          maxLength={50}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" size="lg" block disabled={!name.trim()}>
          {m.actionSave()}
        </Button>
      </form>
    </Sheet>
  )
}
