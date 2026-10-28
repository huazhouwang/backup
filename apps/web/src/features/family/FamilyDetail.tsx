import { type FamilySummary, canManageMember, familyDisplayName, isManager } from '@lullabo/shared'
import { Badge } from '@lullabo/ui/badge'
import { Button } from '@lullabo/ui/button'
import { Card } from '@lullabo/ui/card'
import { FormError } from '@lullabo/ui/form-error'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { ConfirmSheet } from '../../components/ConfirmSheet'
import { ListRow } from '../../components/ListRow'
import { toastIfRefused } from '../../lib/server-collection'
import { m } from '../../paraglide/messages.js'
import { requestSync } from '../../sync/runner'
import { FamilyAiCard } from '../ai/FamilyAiCard'
import { ageLabel } from '../babies/age-label'
import { BabyAvatar } from '../babies/BabyAvatar'
import { useBabies } from '../babies/use-babies'
import { useRecordCount } from '../events/use-events'
import { AliasSheet } from './AliasSheet'
import { familyApi } from './api'
import { scopeLabel } from './BabyScopePicker'
import { useInvites, useMembers } from './collections'
import { DeleteFamilySheet } from './DeleteFamilySheet'
import { InviteSheet } from './InviteSheet'
import { MemberSheet } from './MemberSheet'
import { familyKeys } from './queries'
import { RenameSheet } from './RenameSheet'
import { roleLabel } from './roles'

/** One family: its babies, members and invites, and the actions the user's role allows. */
export function FamilyDetail({ family, userId }: { family: FamilySummary; userId: string }) {
  const { active, archived } = useBabies()
  const babies = [...active, ...archived].filter((baby) => baby.familyId === family.id)
  const queryClient = useQueryClient()
  const members = useMembers(family.id)
  const managing = isManager(family.role)
  const { invites, collection: invitesCollection } = useInvites(family.id, managing)
  const [sheet, setSheet] = useState<'invite' | 'rename' | 'alias' | 'leave' | 'delete' | null>(
    null,
  )
  const close = () => setSheet(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = members?.find((member) => member.userId === editingId)
  // Members and invites both change after inviting, editing or revoking.
  const refresh = () => void queryClient.invalidateQueries({ queryKey: familyKeys.all(family.id) })

  const navigate = useNavigate()
  const leave = useMutation({
    mutationFn: () => familyApi.removeMember(family.id, userId),
    onSuccess: async () => {
      close()
      await navigate({ to: '/settings' })
      // The next pull no longer lists the family, which removes its data from this device.
      await requestSync()
    },
  })
  const revoke = (code: string) => {
    if (invitesCollection) toastIfRefused(invitesCollection.delete(code), m.actionFailed())
  }

  const records = useRecordCount({ familyId: family.id })
  const others = (members?.length ?? family.memberCount ?? 1) - 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-display font-extrabold">
            {familyDisplayName(family)}
          </h1>
          <Badge>{roleLabel[family.role]()}</Badge>
        </div>
        {family.alias && (
          <p className="text-caption text-muted-foreground">
            {m.familyAliasOf({ name: family.name })}
          </p>
        )}
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="text-caption font-bold text-muted-foreground">{m.familyBabies()}</h2>
        {babies.length === 0 ? (
          <p className="text-muted-foreground">{m.familyNoBabies()}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {babies.map((baby) => (
              <li key={baby.id} className="flex items-center gap-3">
                <BabyAvatar name={baby.name} color={baby.avatarColor} />
                <span className="flex flex-col">
                  <span className="font-extrabold">{baby.name}</span>
                  <span className="text-caption text-muted-foreground">
                    {ageLabel(baby.birthDate)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="m-0 text-caption font-bold text-muted-foreground">{m.familyTitle()}</h3>
        {members === undefined ? (
          <p className="m-0 text-muted-foreground">{m.familyLoadFailed()}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {members.map((member) => {
              const editable = member.userId !== userId && canManageMember(family.role, member.role)
              return (
                <li key={member.userId}>
                  <ListRow
                    disabled={!editable}
                    aria-label={`${member.name} ${roleLabel[member.role]()}`}
                    onClick={() => setEditingId(member.userId)}
                    title={
                      <span className="truncate">
                        {member.userId === userId
                          ? `${member.name}（${m.familyMemberYou()}）`
                          : member.name}
                      </span>
                    }
                    detail={`${roleLabel[member.role]()} · ${scopeLabel(member.babyIds, babies)}`}
                  />
                </li>
              )
            })}
          </ul>
        )}

        {managing && invites.length > 0 && (
          <>
            <h3 className="m-0 text-caption font-bold text-muted-foreground">
              {m.invitePending()}
            </h3>
            <ul className="m-0 flex list-none flex-col p-0">
              {invites.map((invite) => (
                <li key={invite.code} className="flex min-h-touch items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">
                    {`${roleLabel[invite.role]()} · ${scopeLabel(invite.babyIds, babies)}`}
                  </span>
                  <Button variant="ghost" tone="destructive" onClick={() => revoke(invite.code)}>
                    {m.inviteRevoke()}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}

        {managing && (
          <Button variant="soft" tone="diaper" onClick={() => setSheet('invite')}>
            {m.familyInvite()}
          </Button>
        )}
      </Card>

      <FamilyAiCard familyId={family.id} managing={managing} />

      <Card className="flex flex-col gap-2">
        {managing && (
          <Button variant="outline" onClick={() => setSheet('rename')}>
            {m.familyRename()}
          </Button>
        )}
        {family.role !== 'owner' && (
          <Button variant="outline" onClick={() => setSheet('alias')}>
            {m.familyAlias()}
          </Button>
        )}
        {family.role === 'owner' ? (
          <Button variant="ghost" tone="destructive" onClick={() => setSheet('delete')}>
            {m.familyDelete()}
          </Button>
        ) : (
          <Button variant="ghost" tone="destructive" onClick={() => setSheet('leave')}>
            {m.familyLeave()}
          </Button>
        )}
        {leave.isError && <FormError>{m.actionFailed()}</FormError>}
      </Card>

      <InviteSheet
        family={family}
        babies={babies}
        open={sheet === 'invite'}
        onClose={close}
        onCreated={refresh}
      />
      <RenameSheet key={family.name} family={family} open={sheet === 'rename'} onClose={close} />
      <AliasSheet
        key={`alias-${sheet === 'alias'}`}
        family={family}
        open={sheet === 'alias'}
        onClose={close}
      />
      <DeleteFamilySheet
        key={`delete-${sheet === 'delete'}`}
        family={family}
        babies={babies.length}
        records={records}
        members={others}
        open={sheet === 'delete'}
        onClose={close}
      />
      <MemberSheet
        family={family}
        member={editing}
        babies={babies}
        onClose={() => setEditingId(null)}
        onChanged={() => {
          refresh()
          // A transfer changes this user's own role, which arrives with the access list.
          void requestSync()
        }}
      />
      <ConfirmSheet
        open={sheet === 'leave'}
        onClose={close}
        title={m.familyLeave()}
        confirmLabel={m.familyLeaveConfirm()}
        onConfirm={() => leave.mutate()}
        busy={leave.isPending}
      >
        {m.familyLeaveBody({ name: familyDisplayName(family) })}
      </ConfirmSheet>
    </div>
  )
}
