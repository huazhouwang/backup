import { type FamilySummary, familyDisplayName } from '@lullabo/shared'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { DeleteConfirmSheet } from '../../components/ui/DeleteConfirmSheet'
import { m } from '../../paraglide/messages.js'
import { requestSync } from '../../sync/runner'
import { familyApi } from './api'

/**
 * Deleting a family removes its babies and records for everyone. The sheet spells that out
 * and, unless the family is empty, asks for its name before the button works.
 */
export function DeleteFamilySheet({
  family,
  babies,
  records,
  members,
  open,
  onClose,
}: {
  family: FamilySummary
  babies: number
  records: number
  /** Members other than the owner. */
  members: number
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const empty = babies === 0 && members === 0
  const remove = useMutation({
    mutationFn: () => familyApi.remove(family.id),
    onSuccess: async () => {
      onClose()
      await navigate({ to: '/settings' })
      // The next pull no longer lists the family, which removes its data from this device.
      await requestSync()
    },
  })

  return (
    <DeleteConfirmSheet
      open={open}
      onClose={onClose}
      title={m.familyDelete()}
      emptyMessage={m.familyDeleteEmpty({ name: familyDisplayName(family) })}
      consequences={
        empty
          ? undefined
          : {
              lead: m.deleteLead({ name: family.name }),
              items: [
                m.familyDeleteRecords({ babies, records }),
                members > 0 && m.familyDeleteMembers({ count: members }),
                m.familyDeleteInvites(),
              ],
              hint: members > 0 && m.familyDeleteTransferHint(),
              name: family.name,
              typeLabel: m.familyDeleteTypeName({ name: family.name }),
            }
      }
      pending={remove.isPending}
      failed={remove.isError}
      onConfirm={() => remove.mutate()}
    />
  )
}
