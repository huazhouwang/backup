import { prefersReducedMotion } from '@lullabo/ui/motion'
import type { AnyRouter } from '@tanstack/react-router'

import { type PageTransition, pageTransition } from './page-transition'

/**
 * Page changes, animated with the pages themselves rather than pictures of them: a copy of
 * the page being left (its own elements, frozen, nothing in it running) stays on screen and
 * moves out while the new page, already live, moves in. Pictures of a long page are slow
 * to take and move on iPhones; the copy is only drawn where it is on screen.
 */

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** How long the page left waits on screen for the new one. */
const GIVE_UP_MS = 2_000

interface Motion {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
}

const slide = (keyframes: Keyframe[]): Motion => ({
  keyframes,
  options: { duration: 280, easing: EASE_OUT, fill: 'both' },
})

/** How the page left and the page come move, by the way the app moves. */
const MOTIONS: Record<PageTransition, { out?: Motion; in?: Motion; leftOnTop: boolean }> = {
  // Into a sub-page: it comes in from the right over the page, which slips a little left.
  forward: {
    out: slide([{}, { translate: '-25% 0', opacity: 0 }]),
    in: slide([{ translate: '100% 0' }, {}]),
    leftOnTop: false,
  },
  // Back out: the sub-page goes off to the right, uncovering the page underneath.
  back: {
    out: slide([{}, { translate: '100% 0' }]),
    in: slide([{ translate: '-25% 0', opacity: 0 }, {}]),
    leftOnTop: true,
  },
  // Between tabs: a quick fade.
  tab: {
    // Held at its end (fill), or the page left would show again under the one fading in.
    out: {
      keyframes: [{}, { opacity: 0 }],
      options: { duration: 120, easing: 'ease-out', fill: 'both' },
    },
    in: {
      keyframes: [{ translate: '0 0.5rem', opacity: 0 }, {}],
      options: { duration: 220, delay: 60, easing: EASE_OUT, fill: 'both' },
    },
    leftOnTop: false,
  },
  // The chat slides up over the page, which stays where it is (the same bounce as a sheet).
  up: {
    in: {
      keyframes: [{ translate: '0 100%' }, {}],
      options: { duration: 380, easing: 'cubic-bezier(0.2, 1.15, 0.35, 1)', fill: 'both' },
    },
    leftOnTop: false,
  },
  // And back down off it, the page already there underneath.
  down: {
    out: {
      keyframes: [{}, { translate: '0 100%' }],
      options: { duration: 300, easing: EASE_OUT, fill: 'both' },
    },
    leftOnTop: true,
  },
}

/** For people who ask for less motion: the page left fades out and the new one in. */
const FADE: Motion = {
  keyframes: [{}, { opacity: 0 }],
  options: { duration: 150, easing: 'ease-out', fill: 'both' },
}
const fadeIn: Motion = { ...FADE, keyframes: [{ opacity: 0 }, {}] }

function motionFor(kind: PageTransition) {
  if (!prefersReducedMotion()) return MOTIONS[kind]
  const { leftOnTop } = MOTIONS[kind]
  if (kind === 'up') return { in: fadeIn, leftOnTop }
  if (kind === 'down') return { out: FADE, leftOnTop }
  return { out: FADE, in: fadeIn, leftOnTop }
}

/** Over the page and under the tab bar, or over the tab bar too for the chat going down. */
const LAYER = { under: '5', over: '30' }

/**
 * A copy of the page as it is on screen, placed exactly over it: a screen-sized layer
 * that clips the copy, so only what was on screen is drawn.
 */
function freeze(main: HTMLElement): HTMLElement {
  const box = main.getBoundingClientRect()
  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.inert = true
  layer.dataset.leavingPage = ''
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    background: 'var(--color-background)',
  })
  const copy = main.cloneNode(true)
  if (!(copy instanceof HTMLElement)) return layer
  copy.removeAttribute('id')
  Object.assign(copy.style, {
    position: 'absolute',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    margin: '0',
  })
  layer.append(copy)
  // Next to the page, so the tab bar and everything after it stays in front.
  main.after(layer)
  // Scrolled rows (the stage chips) stay where they were.
  const from = main.querySelectorAll('*')
  const to = copy.querySelectorAll('*')
  for (const [index, element] of from.entries()) {
    const twin = to[index]
    if (!twin || (element.scrollLeft === 0 && element.scrollTop === 0)) continue
    twin.scrollLeft = element.scrollLeft
    twin.scrollTop = element.scrollTop
  }
  return layer
}

/** The page's own layer while it moves, above or below the copy of the one left. */
function lift(main: HTMLElement, onTop: boolean) {
  main.style.position = 'relative'
  main.style.zIndex = onTop ? '6' : '4'
  return () => {
    main.style.position = ''
    main.style.zIndex = ''
  }
}

/** Animates every page change of `router` in `main`; returns a function to stop. */
export function animatePageChanges(router: AnyRouter, main: HTMLElement): () => void {
  let leaving: { layer: HTMLElement; kind: PageTransition } | null = null
  const clear = () => {
    leaving?.layer.remove()
    leaving = null
  }

  const before = router.subscribe('onBeforeNavigate', (event) => {
    clear()
    // A change of search only (a tab within a page, a sheet) doesn't move the page.
    if (!event.fromLocation || !event.pathChanged) return
    const kind = pageTransition(event.fromLocation.pathname, event.toLocation.pathname)
    const layer = freeze(main)
    layer.style.zIndex = kind === 'down' ? LAYER.over : LAYER.under
    leaving = { layer, kind }
    // A change that never shows (cancelled, or slow to load) doesn't keep the copy up.
    setTimeout(() => {
      if (leaving?.layer === layer) clear()
    }, GIVE_UP_MS)
  })

  const rendered = router.subscribe('onRendered', () => {
    if (!leaving) return
    const { layer, kind } = leaving
    leaving = null
    const motion = motionFor(kind)
    // The chat is its own layer, fixed over the page; anything else moves the page.
    const coming = kind === 'up' ? main.querySelector<HTMLElement>('[data-cover]') : main
    const drop = kind === 'up' || kind === 'down' ? () => undefined : lift(main, !motion.leftOnTop)
    const moves = [
      motion.out && layer.animate(motion.out.keyframes, motion.out.options),
      motion.in && coming?.animate(motion.in.keyframes, motion.in.options),
    ].filter((move) => move !== undefined && move !== null)
    void Promise.allSettled(moves.map((move) => move.finished)).then(() => {
      layer.remove()
      drop()
      // The page's own motion leaves nothing behind once it is done.
      for (const move of moves) move.cancel()
    })
  })

  return () => {
    before()
    rendered()
    clear()
  }
}
