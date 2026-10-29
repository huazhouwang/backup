import { showToast } from '@lullabo/ui/toast'
import { useEffect } from 'react'

import { isSoundPlaying } from '../features/sounds/player'
import { isMicrophoneOn } from '../features/voice/recorder'
import { useServiceWorker, useWaitingUpdate } from '../lib/pwa'
import { m } from '../paraglide/messages.js'
import { mayApplyUpdate } from './auto-update'

const UPDATE_TOAST = 'update'

/** Offers a waiting update until the user applies it (or swipes the toast away). */
export function showUpdateToast(apply: () => void) {
  showToast(m.updateAvailable(), {
    id: UPDATE_TOAST,
    duration: Infinity,
    action: { label: m.updateNow(), onClick: apply },
  })
}

// The app counts as fresh from when it opened or came back to the foreground until the
// first tap or key: reloading then interrupts nothing.
let freshSince = 0
let touched = false
if (typeof window !== 'undefined') {
  const touch = () => {
    touched = true
  }
  window.addEventListener('pointerdown', touch, { capture: true })
  window.addEventListener('keydown', touch, { capture: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    freshSince = performance.now()
    touched = false
  })
}

/** Something a reload would cut short: an open sheet, typing, speaking or a sound playing. */
function busy() {
  const focused = document.activeElement
  return (
    document.querySelector('[data-slot=sheet]') !== null ||
    focused instanceof HTMLInputElement ||
    focused instanceof HTMLTextAreaElement ||
    (focused instanceof HTMLElement && focused.isContentEditable) ||
    isMicrophoneOn() ||
    isSoundPlaying()
  )
}

/**
 * Registers the service worker and applies updates it finds: on its own while the app has
 * just opened or come back and nothing is under way, else when the user taps the toast.
 */
export function UpdatePrompt() {
  useServiceWorker()
  const update = useWaitingUpdate()
  useEffect(() => {
    if (!update) return undefined
    const applyIfFresh = () => {
      const moment = {
        visible: document.visibilityState === 'visible',
        sinceFresh: performance.now() - freshSince,
        touched,
        busy: busy(),
      }
      if (mayApplyUpdate(moment)) update()
    }
    applyIfFresh()
    showUpdateToast(update)
    // Found while in use: it applies the next time the app comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') applyIfFresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [update])
  return null
}
