import { clsx } from 'clsx'
import { animate, m as motion, useMotionValue, useTransform } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { prefersReducedMotion, spring } from '../lib/motion'
import { m } from '../paraglide/messages.js'
import { currentSyncState, requestSync } from '../sync/runner'

/** How far (px) the page must be pulled to refresh, and where the badge rests meanwhile. */
const THRESHOLD = 72
/** The page stops following the finger here. */
const MAX_PULL = 120
/** The shortest spin, so a fast sync still reads as "refreshed". */
const MIN_SPIN_MS = 600
const DONE_MS = 700
/** Coming to the page refreshes on its own only when the last sync is older than this. */
const STALE_MS = 30_000
const REFRESH_EVENT = 'lullabo:refresh-today'

/** Tapping the Today tab while on it: back to the top, then refresh as if pulled. */
export const refreshToday = () => window.dispatchEvent(new Event(REFRESH_EVENT))

/** Waits for a smooth scroll to the top, for at most a second. */
function scrollToTop() {
  if (window.scrollY <= 0) return Promise.resolve()
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  const until = Date.now() + 1_000
  return new Promise<void>((done) => {
    const check = () =>
      window.scrollY <= 0 || Date.now() > until ? done() : requestAnimationFrame(check)
    requestAnimationFrame(check)
  })
}

type Phase = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'done' | 'failed'

/** Finger travel to page travel: follows closely at first, then resists. */
const rubber = (dy: number) => MAX_PULL * (1 - Math.exp(-dy / (MAX_PULL * 1.6)))

/**
 * Pull down at the top of the page to sync now. Coming to the page with stale records, or
 * tapping its tab while on it, does the same. The page itself does not bounce (body has
 * overscroll-behavior: none), so the pull is drawn here: a bold arrow that turns when
 * letting go would refresh, a spin while syncing, then a tick.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const pull = useMotionValue(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')

  const badgeY = useTransform(pull, (value) => value - 64)
  const badgeScale = useTransform(pull, [0, THRESHOLD], [0.6, 1], { clamp: true })
  const arrowTurn = useTransform(pull, [THRESHOLD * 0.6, THRESHOLD], [0, 180], { clamp: true })
  const badgeOpacity = useTransform(pull, [0, 24], [0, 1], { clamp: true })

  useEffect(() => {
    const set = (next: Phase) => {
      phaseRef.current = next
      setPhase(next)
    }
    const settle = (to: number) =>
      animate(pull, to, prefersReducedMotion() ? { duration: 0 } : spring)

    let startY: number | null = null
    const onStart = (event: TouchEvent) => {
      const busy = phaseRef.current === 'refreshing' || phaseRef.current === 'done'
      const inSheet = event.target instanceof Element && event.target.closest('dialog')
      startY = !busy && !inSheet && window.scrollY <= 0 ? (event.touches[0]?.clientY ?? null) : null
    }
    const onMove = (event: TouchEvent) => {
      if (startY === null) return
      const dy = (event.touches[0]?.clientY ?? startY) - startY
      if (dy <= 0 || window.scrollY > 0) {
        pull.set(0)
        if (phaseRef.current !== 'idle') set('idle')
        return
      }
      const value = rubber(dy)
      pull.set(value)
      set(value >= THRESHOLD ? 'ready' : 'pulling')
    }
    /** Holds the page open, syncs, shows how it went, then springs back. */
    const refresh = async () => {
      set('refreshing')
      void settle(THRESHOLD)
      await Promise.all([requestSync(), new Promise((done) => setTimeout(done, MIN_SPIN_MS))])
      const { phase: synced } = currentSyncState()
      const failed = synced === 'error' || synced === 'offline'
      set(failed ? 'failed' : 'done')
      await new Promise((done) => setTimeout(done, DONE_MS))
      await settle(0)
      set('idle')
    }
    const finish = async () => {
      if (startY === null) return
      startY = null
      if (phaseRef.current === 'ready') {
        await refresh()
        return
      }
      set('idle')
      void settle(0)
    }
    // Coming to the page (from the background or another tab) refreshes as if pulled when the
    // records may be stale. Away from the top, or with a sheet open, the sync runner still
    // syncs quietly.
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible' || phaseRef.current !== 'idle') return
      if (window.scrollY > 0 || document.querySelector('dialog[open]')) return
      const { phase: synced, lastSyncedAt } = currentSyncState()
      if (synced === 'signed-out') return
      if (lastSyncedAt !== undefined && Date.now() - lastSyncedAt < STALE_MS) return
      void refresh()
    }
    // The Today tab tapped while on it: always refresh.
    const onTabTap = async () => {
      if (phaseRef.current !== 'idle' || document.querySelector('dialog[open]')) return
      await scrollToTop()
      if (phaseRef.current === 'idle') await refresh()
    }
    const onForeground = () => refreshIfStale()
    const onRefresh = () => void onTabTap()
    refreshIfStale()

    const onEnd = () => void finish()

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    document.addEventListener('visibilitychange', onForeground)
    window.addEventListener('focus', onForeground)
    window.addEventListener(REFRESH_EVENT, onRefresh)
    return () => {
      window.removeEventListener(REFRESH_EVENT, onRefresh)
      document.removeEventListener('visibilitychange', onForeground)
      window.removeEventListener('focus', onForeground)
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [pull])

  const label =
    phase === 'ready'
      ? m.pullRelease()
      : phase === 'refreshing'
        ? m.pullSyncing()
        : phase === 'done'
          ? m.pullDone()
          : phase === 'failed'
            ? m.pullFailed()
            : m.pullHint()

  return (
    <div data-pull-to-refresh className="relative">
      <motion.output
        aria-hidden={phase === 'idle'}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1"
        style={{ y: badgeY, opacity: badgeOpacity }}
      >
        <motion.span
          style={{ scale: badgeScale }}
          className={clsx(
            'flex size-8 items-center justify-center',
            phase === 'failed' ? 'text-danger-text' : 'text-primary-text',
          )}
        >
          {phase === 'refreshing' ? (
            <Spinner />
          ) : phase === 'done' ? (
            <Tick />
          ) : phase === 'failed' ? (
            <Bang />
          ) : (
            <motion.span style={{ rotate: arrowTurn }} className="flex">
              <Arrow />
            </motion.span>
          )}
        </motion.span>
        <span
          className={clsx(
            'text-caption font-extrabold',
            phase === 'failed' ? 'text-danger-text' : 'text-primary-text',
          )}
        >
          {label}
        </span>
      </motion.output>
      <motion.div style={{ y: pull }}>{children}</motion.div>
    </div>
  )
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
      <path
        d="M12 5v13m0 0-5.5-5.5M12 18l5.5-5.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 animate-spin" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" />
      <path d="M12 4a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function Tick() {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      aria-hidden="true"
      initial={{ scale: 0.4 }}
      animate={{ scale: [0.4, 1.25, 1] }}
      transition={{ duration: 0.35 }}
    >
      <path
        d="m5.5 12.5 4.5 4.5 8.5-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </motion.svg>
  )
}

function Bang() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
      <path d="M12 6v7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="12" cy="18" r="1.75" fill="currentColor" />
    </svg>
  )
}
