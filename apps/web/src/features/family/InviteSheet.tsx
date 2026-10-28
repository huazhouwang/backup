import { type Baby, type FamilySummary, type MemberRole, assignableRoles } from '@lullabo/shared'
import { Button } from '@lullabo/ui/button'
import { FormError } from '@lullabo/ui/form-error'
import { Sheet } from '@lullabo/ui/sheet'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '../../paraglide/messages.js'
import { familyApi, inviteUrl } from './api'
import { BabyScopePicker } from './BabyScopePicker'
import { RolePicker } from './RolePicker'

export function InviteSheet({
  family,
  babies,
  open,
  onClose,
  onCreated,
}: {
  family: FamilySummary
  babies: Baby[]
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={m.familyInvite()}>
      {/* Mounted only while open, so every invite starts from a fresh form. */}
      {open && <InviteContent family={family} babies={babies} onCreated={onCreated} />}
    </Sheet>
  )
}

function InviteContent({
  family,
  babies,
  onCreated,
}: {
  family: FamilySummary
  babies: Baby[]
  onCreated: () => void
}) {
  const [role, setRole] = useState<MemberRole>('caregiver')
  const [babyIds, setBabyIds] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)
  const create = useMutation({
    mutationFn: () => familyApi.createInvite(family.id, { role, babyIds }),
    onSuccess: onCreated,
  })
  const invite = create.data

  const url = invite ? inviteUrl(invite.code) : ''
  async function share() {
    try {
      await navigator.share({ title: m.joinTitle(), text: m.inviteShareText(), url })
    } catch {
      // Dismissed, or sharing is unavailable.
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return invite ? (
    <div className="flex flex-col gap-3">
      <p className="m-0 font-bold">{m.inviteLinkTitle()}</p>
      <p className="m-0 rounded-lg border-2 border-border bg-muted p-3 text-caption break-all select-all">
        {url}
      </p>
      <p className="m-0 text-caption text-muted-foreground">{m.inviteLinkHint()}</p>
      {'share' in navigator && (
        <Button size="lg" block onClick={() => void share()}>
          {m.inviteShare()}
        </Button>
      )}
      <Button variant="outline" block onClick={() => void copy()}>
        {copied ? m.inviteCopied() : m.inviteCopy()}
      </Button>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <RolePicker roles={assignableRoles(family.role)} value={role} onChange={setRole} />
      {babies.length > 1 && (
        <BabyScopePicker babies={babies} value={babyIds} onChange={setBabyIds} />
      )}
      <Button
        size="lg"
        block
        disabled={babyIds?.length === 0 || create.isPending}
        onClick={() => create.mutate()}
      >
        {m.inviteCreate()}
      </Button>
      {create.isError && <FormError>{m.actionFailed()}</FormError>}
    </div>
  )
}
