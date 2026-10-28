import type { Baby } from '@lullabo/shared'
import { Button } from '@lullabo/ui/button'
import { Sheet } from '@lullabo/ui/sheet'
import { useState } from 'react'

import { ListRow } from '../../components/ListRow'
import { useLocalStore } from '../../db'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { setBabyArchived, updateBaby } from './actions'
import { ageLabel } from './age-label'
import { BabyAvatar } from './BabyAvatar'
import { BabyForm } from './BabyForm'
import { DeleteBabySheet } from './DeleteBabySheet'
import { useBabies } from './use-babies'

function BabyRow({ baby, onClick }: { baby: Baby; onClick?: () => void }) {
  return (
    <ListRow
      disabled={!onClick}
      onClick={onClick}
      leading={<BabyAvatar name={baby.name} color={baby.avatarColor} />}
      title={<span className="truncate">{baby.name}</span>}
      detail={ageLabel(baby.birthDate)}
    />
  )
}

/** Baby management in settings: edit, archive and restore. */
export function BabyList() {
  const store = useLocalStore()
  const { active, archived } = useBabies()
  const access = useAccess()
  const manageable = (baby: Baby) => access.forBaby(baby).canManageBaby
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const editing = [...active, ...archived].find((baby) => baby.id === editingId)
  const close = () => setEditingId(null)

  return (
    <div className="flex flex-col gap-2">
      {active.length === 0 && <p className="text-muted-foreground">{m.babyListEmpty()}</p>}
      {active.map((baby) => (
        <BabyRow
          key={baby.id}
          baby={baby}
          onClick={manageable(baby) ? () => setEditingId(baby.id) : undefined}
        />
      ))}
      {archived.length > 0 && (
        <>
          <h3 className="mt-2 text-caption font-bold text-muted-foreground">
            {m.babyArchivedGroup()}
          </h3>
          {archived.map((baby) => (
            <div key={baby.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1 opacity-70">
                <BabyRow
                  baby={baby}
                  onClick={manageable(baby) ? () => setEditingId(baby.id) : undefined}
                />
              </div>
              {manageable(baby) && (
                <Button
                  variant="ghost"
                  tone="diaper"
                  onClick={() => setBabyArchived(store, baby.id, false)}
                >
                  {m.babyRestore()}
                </Button>
              )}
            </div>
          ))}
        </>
      )}

      <Sheet open={editing !== undefined} onClose={close} title={m.babyEditTitle()}>
        {editing && (
          <>
            <BabyForm
              key={editing.id}
              initial={editing}
              submitLabel={m.actionSave()}
              onCancel={close}
              onSubmit={(input) => {
                updateBaby(store, editing.id, input)
                close()
              }}
            />
            <div className="flex flex-col gap-1 border-t-2 border-border pt-4">
              {editing.archivedAt === null && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setBabyArchived(store, editing.id, true)
                      close()
                    }}
                  >
                    {m.babyArchive()}
                  </Button>
                  <p className="text-center text-caption text-muted-foreground">
                    {m.babyArchiveHint()}
                  </p>
                </>
              )}
              <Button
                variant="ghost"
                tone="destructive"
                onClick={() => {
                  setDeletingId(editing.id)
                  close()
                }}
              >
                {m.babyDelete()}
              </Button>
              <p className="text-center text-caption text-muted-foreground">{m.babyDeleteHint()}</p>
            </div>
          </>
        )}
      </Sheet>
      <DeleteBabySheet
        baby={[...active, ...archived].find((baby) => baby.id === deletingId)}
        onClose={() => setDeletingId(null)}
      />
    </div>
  )
}
