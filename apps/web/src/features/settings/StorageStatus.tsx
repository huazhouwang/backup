import { cn } from '@lullabo/ui/utils'

import { type StorageMode, useLocalStore } from '../../db'
import { m } from '../../paraglide/messages.js'
import { useAccount } from '../../sync/use-access'

const descriptions: Record<StorageMode, () => string> = {
  persistent: m.storagePersistent,
  'best-effort': m.storageBestEffort,
  memory: m.storageMemory,
}

/** Where records are kept: on this device only, or also in the cloud once signed in. */
export function StorageStatus() {
  const { mode } = useLocalStore()
  const signedIn = useAccount() !== undefined
  const text = !signedIn
    ? descriptions[mode]()
    : mode === 'memory'
      ? m.storageMemorySynced()
      : m.storageSynced()

  return (
    <p
      className={cn(
        mode === 'memory' ? 'font-bold text-destructive-text' : 'text-muted-foreground',
      )}
    >
      {text}
    </p>
  )
}
