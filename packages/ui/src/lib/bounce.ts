import { type AnimationPlaybackControls, animate } from 'motion/react'
import { type RefObject, useEffect } from 'react'

import { prefersReducedMotion, spring } from './motion'

export type BounceAxis = 'x' | 'y'
export type BounceEdge = 'start' | 'end'

/** Finger travel before a gesture is taken as horizontal or vertical. */
const SLOP = 6

/**
 * iOS's rubber band: the content follows the finger closely at first, then ever less, never
 * further than the scroll area is long.
 */
export function rubberBand(distance: number, length: number): number {
  const pull = Math.abs(distance)
  const offset = (1 - 1 / ((pull * 0.55) / length + 1)) * length
  return Math.sign(distance) * offset
}

interface Scroller {
  position: (axis: BounceAxis) => number
  max: (axis: BounceAxis) => number
  length: (axis: BounceAxis) => number
}

const windowScroller: Scroller = {
  position: (axis) => (axis === 'y' ? window.scrollY : window.scrollX),
  max: (axis) =>
    axis === 'y'
      ? document.documentElement.scrollHeight - window.innerHeight
      : document.documentElement.scrollWidth - window.innerWidth,
  length: (axis) => (axis === 'y' ? window.innerHeight : window.innerWidth),
}

const elementScroller = (element: HTMLElement): Scroller => ({
  position: (axis) => (axis === 'y' ? element.scrollTop : element.scrollLeft),
  max: (axis) =>
    axis === 'y'
      ? element.scrollHeight - element.clientHeight
      : element.scrollWidth - element.clientWidth,
  length: (axis) => (axis === 'y' ? element.clientHeight : element.clientWidth),
})

// Touch events only; checked by shape, as TouchEvent itself is missing on some desktops.
const isTouch = (event: Event): event is TouchEvent => 'touches' in event
const touchOnly =
  (handle: (event: TouchEvent) => void) =>
  (event: Event): void => {
    if (isTouch(event)) handle(event)
  }

export interface BounceOptions {
  /** Axes that bounce: one, or both. */
  axes: readonly BounceAxis[]
  /** Touches another gesture owns, e.g. Today's pull-to-refresh at the top of the page. */
  ignore?: (target: Element, axis: BounceAxis, edge: BounceEdge) => boolean
}

/**
 * Bounces `content` when a touch drags `scroller` past an end on one of `axes`, and springs
 * it back on release. The app turns off the browser's own overscroll (its styles/app.css), so
 * this draws it the same way on every platform. Returns the function that detaches it.
 */
export function attachBounce(
  scroller: HTMLElement | Window,
  content: HTMLElement,
  { axes, ignore }: BounceOptions,
): () => void {
  const area = scroller instanceof Window ? windowScroller : elementScroller(scroller)
  let gesture: {
    target: Element
    startX: number
    startY: number
    axis: BounceAxis | 'other' | null
    /** Finger position where the pull past the end began. */
    anchor: number | null
    edge: BounceEdge
    /** Where the finger was at the previous move. */
    last: { x: number; y: number }
  } | null = null
  let offset = 0
  let release: AnimationPlaybackControls | null = null

  const apply = (axis: BounceAxis, value: number) => {
    offset = value
    content.style.transform =
      value === 0
        ? ''
        : axis === 'y'
          ? `translate3d(0, ${value}px, 0)`
          : `translate3d(${value}px, 0, 0)`
  }

  const onStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (event.touches.length !== 1 || !touch || !(event.target instanceof Element)) {
      gesture = null
      return
    }
    // A touch during the spring back catches the content where it is.
    release?.stop()
    release = null
    gesture = {
      target: event.target,
      startX: touch.clientX,
      startY: touch.clientY,
      axis: null,
      anchor: null,
      edge: 'start',
      last: { x: touch.clientX, y: touch.clientY },
    }
  }

  const onMove = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (!gesture || !touch) return
    if (gesture.axis === null) {
      const dx = touch.clientX - gesture.startX
      const dy = touch.clientY - gesture.startY
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return
      const dominant: BounceAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      gesture.axis = axes.includes(dominant) ? dominant : 'other'
    }
    if (gesture.axis === 'other') return
    const axis = gesture.axis
    const finger = axis === 'y' ? touch.clientY : touch.clientX
    const previous = axis === 'y' ? gesture.last.y : gesture.last.x
    gesture.last = { x: touch.clientX, y: touch.clientY }
    if (gesture.anchor === null) {
      const position = area.position(axis)
      const atStart = position <= 0
      const atEnd = position >= area.max(axis) - 1
      // Past an end, moving outward: from here on the finger pulls the content instead of
      // scrolling it. A short area is at both ends; the direction picks one.
      const moved = finger - previous
      if (atStart && moved > 0) gesture.edge = 'start'
      else if (atEnd && moved < 0) gesture.edge = 'end'
      else return
      if (ignore?.(gesture.target, axis, gesture.edge)) return
      // From the previous position, so this move already counts; minus a bounce still showing.
      gesture.anchor = previous - offset
    }
    const pulled = finger - gesture.anchor
    // Pulling back past where it began hands the gesture back to normal scrolling.
    const outward = gesture.edge === 'start' ? pulled >= 0 : pulled <= 0
    if (!outward) {
      gesture.anchor = null
      apply(axis, 0)
      return
    }
    if (event.cancelable) event.preventDefault()
    apply(axis, rubberBand(pulled, area.length(axis)))
  }

  const onEnd = () => {
    const axis = gesture?.axis
    gesture = null
    if (offset === 0 || (axis !== 'x' && axis !== 'y')) return
    if (prefersReducedMotion()) {
      apply(axis, 0)
      return
    }
    release = animate(offset, 0, { ...spring, onUpdate: (value) => apply(axis, value) })
  }

  const start = touchOnly(onStart)
  const move = touchOnly(onMove)
  scroller.addEventListener('touchstart', start, { passive: true })
  // Not passive: a pull past the end is the bounce's, not the page's.
  scroller.addEventListener('touchmove', move, { passive: false })
  scroller.addEventListener('touchend', onEnd)
  scroller.addEventListener('touchcancel', onEnd)
  return () => {
    release?.stop()
    content.style.transform = ''
    scroller.removeEventListener('touchstart', start)
    scroller.removeEventListener('touchmove', move)
    scroller.removeEventListener('touchend', onEnd)
    scroller.removeEventListener('touchcancel', onEnd)
  }
}

/**
 * `attachBounce` for a scroll area rendered by React: `scroller` scrolls (or is the window
 * when null), `content` moves (the scroller itself when omitted).
 */
export function useBounce(
  scroller: RefObject<HTMLElement | null> | null,
  options: BounceOptions & { content?: RefObject<HTMLElement | null> },
) {
  const { axes, ignore, content } = options
  const axesKey = axes.join()
  useEffect(() => {
    const area = scroller ? scroller.current : window
    const moving = content?.current ?? (scroller ? scroller.current : null)
    if (!area || !moving) return undefined
    return attachBounce(area, moving, { axes, ignore })
    // The options are fixed for a scroll area's life; the refs are read once mounted.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [axesKey])
}
