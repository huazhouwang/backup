import {
  type Baby,
  type FamilyMember,
  type FamilySummary,
  type MemberRole,
  assignableRoles,
  familyDisplayName,
} from '@lullabo/shared'
import { Button } from '@lullabo/ui/button'
import { FormError } from '@lullabo/ui/form-error'
import { Sheet } from '@lullabo/ui/sheet'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { toastIfRefused } from '../../lib/server-collection'
import { m } from '../../paraglide/messages.js'
import { familyApi } from './api'
import { BabyScopePicker } from './BabyScopePicker'
import { useMembersCollection } from './collections'
import { RolePicker } from './RolePicker'

export function MemberSheet({
  family,
  member,
  babies,
  onClose,
  onChanged,
}: {
  family: FamilySummary
  member: FamilyMember | undefined
  babies: Baby[]
  onClose: () => void
  onChanged: () => void
}) {
  return (
    <Sheet open={member !== undefined} onClose={onClose} title={member?.name ?? m.memberTitle()}>
      {member && member.role !== 'owner' && (
        <MemberForm
          key={member.userId}
          family={family}
          member={{ ...member, role: member.role }}
          babies={babies}
          onDone={onClose}
          onTransferred={() => {
            onChanged()
            onClose()
          }}
        />
      )}
    </Sheet>
  )
}

function MemberForm({
  family,
  member,
  babies,
  onDone,
  onTransferred,
}: {
  family: FamilySummary
  member: FamilyMember & { role: MemberRole }
  babies: Baby[]
  onDone: () => void
  onTransferred: () => void
}) {
  const members = useMembersCollection(family.id)
  const [role, setRole] = useState<MemberRole>(member.role)
  const [babyIds, setBabyIds] = useState<string[] | null>(member.babyIds)
  const [confirmingTransfer, setConfirmingTransfer] = useState(false)
  // Saving or removing shows at once (rolled back with a toast if the server refuses);
  // handing over ownership waits for the server, as it changes this user's own role.
  const save = () => {
    if (members) {
      const change = members.update(member.userId, (draft) => {
        draft.role = role
        draft.babyIds = babyIds
      })
      toastIfRefused(change, m.actionFailed())
    }
    onDone()
  }
  const remove = () => {
    if (members) toastIfRefused(members.delete(member.userId), m.actionFailed())
    onDone()
  }
  const transfer = useMutation({
    mutationFn: () => familyApi.transfer(family.id, member.userId),
    onSuccess: onTransferred,
  })

  return (
    <div className="flex flex-col gap-4">
      <RolePicker roles={assignableRoles(family.role)} value={role} onChange={setRole} />
      {babies.length > 1 && (
        <BabyScopePicker babies={babies} value={babyIds} onChange={setBabyIds} />
      )}
      <Button size="lg" block disabled={babyIds?.length === 0 || transfer.isPending} onClick={save}>
        {m.actionSave()}
      </Button>
      <Button variant="ghost" tone="destructive" disabled={transfer.isPending} onClick={remove}>
        {m.memberRemove()}
      </Button>
      {family.role === 'owner' &&
        (confirmingTransfer ? (
          <div className="flex flex-col gap-3 rounded-xl border-2 border-border p-3">
            <p>{m.memberTransferBody({ family: familyDisplayName(family), name: member.name })}</p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setConfirmingTransfer(false)}>
                {m.actionCancel()}
              </Button>
              <Button disabled={transfer.isPending} onClick={() => transfer.mutate()}>
                {m.memberTransferConfirm()}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmingTransfer(true)}>
            {m.memberTransfer()}
          </Button>
        ))}
      {transfer.isError && <FormError>{m.actionFailed()}</FormError>}
    </div>
  )
}
