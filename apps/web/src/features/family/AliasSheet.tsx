import type { FamilySummary } from '@lullabo/shared'
import { type FormEvent, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Sheet } from '../../components/ui/Sheet'
import { toastIfRefused } from '../../lib/server-collection'
import { m } from '../../paraglide/messages.js'
import { familyApi } from './api'
import { useUpdateFamily } from './use-update-family'

/** A member's private name for a family; only they see it. */
export function AliasSheet({
  family,
  open,
  onClose,
}: {
  family: FamilySummary
  open: boolean
  onClose: () => void
}) {
  const [alias, setAlias] = useState(family.alias ?? '')
  const updateFamily = useUpdateFamily()

  function submit(event: FormEvent) {
    event.preventDefault()
    const next = alias.trim()
    const change = updateFamily({
      familyId: family.id,
      // An empty alias clears it.
      patch: { alias: next || null },
      save: () => familyApi.setAlias(family.id, next),
    })
    toastIfRefused(change, m.actionFailed())
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={m.familyAlias()}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label={m.familyAliasLabel()}
          hint={m.familyAliasHint({ name: family.name })}
          value={alias}
          maxLength={40}
          onChange={(e) => setAlias(e.target.value)}
        />
        <Button type="submit" size="lg" block>
          {m.actionSave()}
        </Button>
      </form>
    </Sheet>
  )
}
