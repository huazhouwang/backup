import { Button } from '@lullabo/ui/button'
import { FormError } from '@lullabo/ui/form-error'
import { Input } from '@lullabo/ui/input'
import { Sheet } from '@lullabo/ui/sheet'
import { useState } from 'react'

import { m } from '../paraglide/messages.js'

export interface DeleteConsequences {
  /** "删除「小米粒」后：" */
  lead: string
  /** What is lost, one point each; `false` entries are left out. */
  items: readonly (string | false)[]
  /** A softer way out, shown under the list (archive, hand over instead). */
  hint?: string | false
  /** The name to type before the button works. */
  name: string
  /** "请输入…确认删除" */
  typeLabel: string
}

/**
 * Confirms a permanent delete. With consequences it lists them and asks for the name to be
 * typed; with nothing much to lose it shows `emptyMessage` and confirms in one tap.
 */
export function DeleteConfirmSheet({
  open,
  onClose,
  title,
  consequences,
  emptyMessage,
  pending = false,
  failed = false,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  consequences: DeleteConsequences | undefined
  emptyMessage: string
  pending?: boolean
  failed?: boolean
  onConfirm: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {/* Remounts on every opening, so the typed name never carries over. */}
      {open && (
        <DeleteConfirmContent
          consequences={consequences}
          emptyMessage={emptyMessage}
          pending={pending}
          failed={failed}
          onConfirm={onConfirm}
          onCancel={onClose}
        />
      )}
    </Sheet>
  )
}

function DeleteConfirmContent({
  consequences,
  emptyMessage,
  pending,
  failed,
  onConfirm,
  onCancel,
}: {
  consequences: DeleteConsequences | undefined
  emptyMessage: string
  pending: boolean
  failed: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const confirmed = !consequences || typed.trim() === consequences.name

  return (
    <>
      {consequences ? (
        <>
          <p className="font-bold">{consequences.lead}</p>
          <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
            {consequences.items.map((item) => item && <li key={item}>{item}</li>)}
          </ul>
          {consequences.hint && <p className="text-muted-foreground">{consequences.hint}</p>}
          <Input
            label={consequences.typeLabel}
            value={typed}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
          />
        </>
      ) : (
        <p>{emptyMessage}</p>
      )}
      <Button
        tone="destructive"
        size="lg"
        block
        disabled={!confirmed || pending}
        onClick={onConfirm}
      >
        {m.actionDeleteForever()}
      </Button>
      <Button variant="outline" block onClick={onCancel}>
        {m.actionCancel()}
      </Button>
      {failed && <FormError>{m.actionFailed()}</FormError>}
    </>
  )
}
