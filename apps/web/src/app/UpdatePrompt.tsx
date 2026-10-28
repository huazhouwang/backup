import { showToast } from '@lullabo/ui/toast'
import { useEffect } from 'react'

import { useServiceWorker, useWaitingUpdate } from '../lib/pwa'
import { m } from '../paraglide/messages.js'

const UPDATE_TOAST = 'update'

/** Offers a waiting update until the user applies it (or swipes the toast away). */
export function showUpdateToast(apply: () => void) {
  showToast(m.updateAvailable(), {
    id: UPDATE_TOAST,
    duration: Infinity,
    action: { label: m.updateNow(), onClick: apply },
  })
}

/** Registers the service worker and announces updates it finds in the background. */
export function UpdatePrompt() {
  useServiceWorker()
  const update = useWaitingUpdate()
  useEffect(() => {
    if (update) showUpdateToast(update)
  }, [update])
  return null
}
