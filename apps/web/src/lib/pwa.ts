import { useEffect } from 'react'

import { createStore, useStore } from './store'

/** Installed to the home screen (or running in the native shell later). */
export function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes this non-standard flag.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as macOS.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function'
}

// Chrome fires beforeinstallprompt once, possibly before React mounts, so capture it early.
const installPrompt = createStore<BeforeInstallPromptEvent | null>(null)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!isBeforeInstallPromptEvent(event)) return
    event.preventDefault()
    installPrompt.set(event)
  })
  window.addEventListener('appinstalled', () => installPrompt.set(null))
}

/** The deferred Android/Chrome install prompt, if the browser offered one. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const prompt = useStore(installPrompt)
  if (!prompt) return null
  return async () => {
    await prompt.prompt()
    await prompt.userChoice
    installPrompt.set(null)
  }
}

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
/** How long a manual check waits for a found update to finish downloading. */
const INSTALL_TIMEOUT_MS = 30_000

/** Applies the waiting update, once one has been found. */
const waitingUpdate = createStore<(() => void) | null>(null)
// A worker also takes control on the very first visit (clients.claim); reloading then
// would interrupt onboarding, so only reload after the user asked for the update.
let accepted = false
let offered: ServiceWorker | null = null

function offerUpdate(worker: ServiceWorker) {
  // Workbox reports the worker a manual check finds too; offer each worker once.
  if (offered === worker) return
  offered = worker
  waitingUpdate.set(() => {
    accepted = true
    // The generated worker skips waiting on this message. Workers take no target origin.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage({ type: 'SKIP_WAITING' })
  })
}

/** Asks the browser to look for a new service worker; the "waiting" event follows if there is one. */
function checkInBackground() {
  if (document.visibilityState !== 'visible' || !navigator.onLine) return
  // Ask the browser directly: Workbox's update() is a no-op until its own register() has
  // resolved, which it may not have in a long-lived page.
  void navigator.serviceWorker
    .getRegistration()
    .then((registration) => registration?.update())
    .catch(() => undefined)
}

/** Resolves once a newly found worker has installed (or failed to). */
function installed(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      if (worker.state === 'installing') return
      worker.removeEventListener('statechange', done)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, INSTALL_TIMEOUT_MS)
    worker.addEventListener('statechange', done)
  })
}

export type UpdateCheck = 'latest' | 'ready' | 'offline' | 'failed'

/** Whether this build can update itself: production builds with a service worker. */
export const canUpdate = () => !import.meta.env.DEV && 'serviceWorker' in navigator

/** Looks for a new version now, for the "check for updates" button. */
export async function checkForUpdateNow(): Promise<UpdateCheck> {
  if (!navigator.onLine) return 'offline'
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return 'failed'
    await registration.update()
    if (registration.installing) await installed(registration.installing)
    if (!registration.waiting) return 'latest'
    offerUpdate(registration.waiting)
    return 'ready'
  } catch {
    return navigator.onLine ? 'failed' : 'offline'
  }
}

/** Applies a waiting update (reloading the app), or null while there is none. */
export const useWaitingUpdate = () => useStore(waitingUpdate)
export const getWaitingUpdate = () => waitingUpdate.get()

/**
 * Registers the service worker in production builds and offers updates as they are found.
 * Applying one is up to UpdatePrompt, which waits until it interrupts nothing.
 */
export function useServiceWorker() {
  useEffect(() => {
    if (!canUpdate()) return undefined
    let cancelled = false
    let stopChecks: () => void = () => undefined
    // Loaded in the browser only: the package is CommonJS on the server, where the shell
    // is prerendered, and it is not needed for the first paint.
    void import('workbox-window').then(({ Workbox }) => {
      if (cancelled) return
      const wb = new Workbox('/sw.js')
      wb.addEventListener('waiting', (event) => {
        if (!cancelled && event.sw) offerUpdate(event.sw)
      })
      // Reload once the new worker takes over after the user accepted the update.
      wb.addEventListener('controlling', () => {
        if (accepted) window.location.reload()
      })
      void wb.register()

      // Browsers only look for a new worker when a page loads. An installed app can stay
      // open in the background for days, so also look when it comes back to the
      // foreground, and every hour while it stays open.
      document.addEventListener('visibilitychange', checkInBackground)
      const interval = setInterval(checkInBackground, UPDATE_CHECK_INTERVAL_MS)
      stopChecks = () => {
        document.removeEventListener('visibilitychange', checkInBackground)
        clearInterval(interval)
      }
    })
    return () => {
      cancelled = true
      stopChecks()
    }
  }, [])
}
