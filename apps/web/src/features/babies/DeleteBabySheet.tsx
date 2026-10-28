import type { Baby } from '@lullabo/shared'

import { DeleteConfirmSheet } from '../../components/DeleteConfirmSheet'
import { useLocalStore } from '../../db'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { useRecordCount } from '../events/use-events'
import { deleteBaby } from './actions'

/**
 * Deleting a baby removes it and every record for the whole family. The sheet says so and,
 * when there are records, asks for the baby's name before the button works.
 */
export function DeleteBabySheet({
  baby,
  onClose,
}: {
  baby: Baby | undefined
  onClose: () => void
}) {
  const store = useLocalStore()
  const { access } = useAccess()
  const records = useRecordCount(baby && { babyId: baby.id })
  const family = access?.find((item) => item.id === baby?.familyId)
  const others = (family?.memberCount ?? 1) - 1
  const name = baby?.name ?? ''

  return (
    <DeleteConfirmSheet
      open={baby !== undefined}
      onClose={onClose}
      title={m.babyDelete()}
      emptyMessage={m.babyDeleteEmpty({ name })}
      consequences={
        records > 0
          ? {
              lead: m.deleteLead({ name }),
              items: [
                m.babyDeleteRecords({ count: records }),
                others > 0 && m.babyDeleteShared({ count: others }),
              ],
              hint: m.babyDeleteArchiveHint(),
              name,
              typeLabel: m.babyDeleteTypeName({ name }),
            }
          : undefined
      }
      onConfirm={() => {
        if (baby) deleteBaby(store, baby.id)
        onClose()
      }}
    />
  )
}
