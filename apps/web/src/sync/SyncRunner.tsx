import { Button } from '@lullabo/ui/button'
import { Sheet } from '@lullabo/ui/sheet'
import { showToast } from '@lullabo/ui/toast'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useLocalStore } from '../db'
import {
  connectIfSignedIn,
  reloadWhenSignedInElsewhere,
  resolveClaimChoice,
  useClaimChoice,
} from '../features/account/connection'
import { persistQueries } from '../lib/persist-queries'
import { m } from '../paraglide/messages.js'
import { startSync, useSyncState } from './runner'
import { useAccount } from './use-access'

const REJECTED_TOAST_MS = 5000

/** Tells the user when the server refused changes (e.g. their role changed while offline). */
function useRejectedToast() {
  const { rejected } = useSyncState()
  useEffect(() => {
    if (rejected) {
      showToast(m.syncRejected({ count: rejected.count }), {
        id: 'sync-rejected',
        tone: 'error',
        duration: REJECTED_TOAST_MS,
      })
    }
  }, [rejected])
}

/** Mounts background sync and links a fresh sign-in to this device. */
export function SyncRunner() {
  const store = useLocalStore()
  const choice = useClaimChoice()
  useRejectedToast()

  // The signed-in user's settings data stays on the device; another account starts empty.
  const queryClient = useQueryClient()
  const userId = useAccount()?.userId
  useEffect(() => persistQueries(queryClient, userId), [queryClient, userId])

  const router = useRouter()

  useEffect(() => {
    const stop = startSync(store)
    // The join page links the account itself, after the invite is accepted.
    const joining = () => router.state.matches.some((match) => match.routeId === '/join/$code')
    if (!joining()) void connectIfSignedIn(store)
    const unwatch = reloadWhenSignedInElsewhere(store, joining)
    return () => {
      stop()
      unwatch()
    }
  }, [store, router])

  return (
    <>
      {/* Closing without choosing keeps the device unlinked; it asks again on the next start. */}
      <Sheet open={choice !== null} onClose={() => undefined} title={m.claimTitle()}>
        {choice && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-muted-foreground">{m.claimBody({ count: choice.unclaimed })}</p>
            {choice.families.map((family) => (
              <Button
                key={family.id}
                size="lg"
                block
                onClick={() => void resolveClaimChoice(store, family)}
              >
                {m.claimMerge({ name: family.name })}
              </Button>
            ))}
            <Button variant="outline" block onClick={() => void resolveClaimChoice(store, 'new')}>
              {m.claimNew()}
            </Button>
          </div>
        )}
      </Sheet>
    </>
  )
}
