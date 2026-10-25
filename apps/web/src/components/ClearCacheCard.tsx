import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { showHintsAgain } from '../lib/hints'
import { m } from '../paraglide/messages.js'
import { Button } from './ui/Button'
import { Card, CardTitle } from './ui/Card'
import { ConfirmSheet } from './ui/ConfirmSheet'
import { showToast } from './ui/Toast'

/**
 * Clears what this device keeps for convenience: explanations chosen not to show again, and
 * the cached server data that settings pages show offline. Records, the account, display
 * settings and the selected baby stay.
 */
export function ClearCacheCard() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const clear = () => {
    showHintsAgain()
    queryClient.clear()
    setOpen(false)
    showToast(m.clearCacheDone(), { tone: 'success' })
  }
  return (
    <Card className="flex flex-col gap-2">
      <CardTitle>{m.clearCacheTitle()}</CardTitle>
      <p className="m-0 text-fg-muted">{m.clearCacheHint()}</p>
      <Button variant="outline" block onClick={() => setOpen(true)}>
        {m.clearCacheAction()}
      </Button>
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        title={m.clearCacheConfirmTitle()}
        confirmLabel={m.clearCacheAction()}
        onConfirm={clear}
      >
        {m.clearCacheConfirm()}
      </ConfirmSheet>
    </Card>
  )
}
