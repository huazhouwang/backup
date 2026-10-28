import { Button } from '@lullabo/ui/button'
import { FormError } from '@lullabo/ui/form-error'
import { Sheet } from '@lullabo/ui/sheet'
import type { ReactNode } from 'react'

import { m } from '../paraglide/messages.js'

/** Asks before a destructive action: explanation, a red confirm button and cancel. */
export function ConfirmSheet({
  open,
  onClose,
  title,
  confirmLabel,
  onConfirm,
  busy = false,
  error,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  confirmLabel: string
  onConfirm: () => void
  busy?: boolean
  error?: string
  children: ReactNode
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p>{children}</p>
      <Button tone="destructive" size="lg" block disabled={busy} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button variant="outline" block onClick={onClose}>
        {m.actionCancel()}
      </Button>
      {error && <FormError>{error}</FormError>}
    </Sheet>
  )
}
