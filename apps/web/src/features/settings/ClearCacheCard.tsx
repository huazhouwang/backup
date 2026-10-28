import { Button } from '@lullabo/ui/button'
import { Card, CardTitle } from '@lullabo/ui/card'
import { showToast } from '@lullabo/ui/toast'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ConfirmSheet } from '../../components/ConfirmSheet'
import { showHintsAgain } from '../../lib/hints'
import { m } from '../../paraglide/messages.js'

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
      <p className="m-0 text-muted-foreground">{m.clearCacheHint()}</p>
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
