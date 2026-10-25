import { clsx } from 'clsx'
import { type PointerEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'

import { useBounce } from '../../lib/bounce'
import { useVisibleArea } from '../../lib/keyboard'
import { prefersReducedMotion } from '../../lib/motion'
import { lockScroll } from '../../lib/scroll-lock'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/** Pulled down this far (px), or flicked down this fast (px/ms), the sheet closes. */
const CLOSE_DISTANCE = 96
const CLOSE_VELOCITY = 0.6
/** How the sheet slides in, with a little bounce. Closing plays the same slide backwards. */
const SLIDE: Keyframe[] = [{ translate: '0 100%' }, { translate: '0 0' }]
const SLIDE_TIMING: KeyframeAnimationOptions = {
  duration: 380,
  easing: 'cubic-bezier(0.2, 1.15, 0.35, 1)',
  fill: 'both',
}
/**
 * After a drag: a slide from hidden through where the finger let go to open, started
 * halfway. Played forwards it settles back open; reversed it carries on down and away.
 */
const DRAG_SLIDE_MS = 400
function slideThrough(dialog: HTMLDialogElement, dy: number) {
  const animation = dialog.animate(
    [
      { translate: '0 100%', easing: 'ease-in' },
      { translate: `0 ${dy}px`, easing: 'ease-out' },
      { translate: '0 0' },
    ],
    { duration: DRAG_SLIDE_MS, fill: 'both' },
  )
  animation.currentTime = DRAG_SLIDE_MS / 2
  return animation
}

/** The value from the last render while open, held unchanged once `open` turns false. */
function useLastOpen<T>(open: boolean, value: T): T {
  const last = useRef(value)
  // Remembering the previous render is the point here, so the ref is read during render.
  // oxlint-disable-next-line react/refs
  if (open) last.current = value
  // oxlint-disable-next-line react/refs
  return open ? value : last.current
}

/**
 * Bottom sheet built on the native <dialog> element, which provides focus trapping,
 * Escape to close and an inert background. Used instead of centered modals for forms.
 */
// Touches that are someone else's: the header's drag, or a control marked data-sheet-still
// (a button held to talk), which the sheet's content must not bounce under.
const onHandle = (target: Element) =>
  target.closest('[data-sheet-handle], [data-sheet-still]') !== null

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  // The content bounces at its ends; the header's own drag (closing the sheet) is left alone.
  useBounce(ref, { axes: ['y'], content: body, ignore: onHandle })
  const titleId = useId()
  // Mirrors `open` so the native close event can tell a user dismissal (Escape) from the
  // parent closing the sheet, which must not call onClose again (e.g. when one sheet
  // hands over to another).
  const openRef = useRef(open)
  const drag = useRef<{ startY: number; startTime: number; dy: number } | null>(null)
  // The current slide; reversing it closes the sheet (or reopens it mid-close).
  const slide = useRef<Animation | null>(null)
  // Parents usually drop the sheet's content as soon as it closes; keep showing what was
  // there until the slide away has finished, so the sheet leaves whole instead of
  // collapsing first. Once closed, the content unmounts.
  const shown = useLastOpen(open, { title, children })
  // True from opening until the closing slide has finished (set before any render where
  // `open` is already false, so the content never drops out for a frame).
  const [shownInDialog, setShownInDialog] = useState(false)

  useEffect(() => {
    openRef.current = open
    const dialog = ref.current
    if (!dialog) return undefined
    if (open) {
      delete dialog.dataset.closing
      if (dialog.open) {
        // Reopened while sliding away: play the slide forwards again.
        if (slide.current && slide.current.playbackRate < 0) slide.current.reverse()
        return undefined
      }
      dialog.showModal()
      setShownInDialog(true)
      // A reused sheet starts at the top, not where its previous content was scrolled to.
      dialog.scrollTop = 0
      // showModal() focuses the first input, which would pop the keyboard on phones.
      dialog.focus()
      slide.current?.cancel()
      slide.current = prefersReducedMotion() ? null : dialog.animate(SLIDE, SLIDE_TIMING)
      return undefined
    }
    if (!dialog.open) return undefined
    const current = slide.current
    if (!current) {
      dialog.close()
      setShownInDialog(false)
      return undefined
    }
    // Every way of closing (backdrop, Escape, a drag, the parent) plays the slide backwards,
    // then closes; the backdrop fades with it (styles/app.css).
    dialog.dataset.closing = ''
    if (current.playbackRate > 0) current.reverse()
    let cancelled = false
    current.finished
      .then(() => {
        if (cancelled) return
        delete dialog.dataset.closing
        dialog.close()
        setShownInDialog(false)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open])

  // The page behind stays put while the sheet is up, even on a sheet too short to scroll.
  useEffect(() => (shownInDialog ? lockScroll() : undefined), [shownInDialog])

  // The sheet rests on the iOS keyboard instead of sitting behind it, and fits above it.
  useVisibleArea(ref, shownInDialog)

  // Dragging the header pulls the sheet down; far or fast enough, it closes.
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    // The finger moves the sheet now; a running slide would hold it in place.
    slide.current?.cancel()
    drag.current = { startY: event.clientY, startTime: event.timeStamp, dy: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dialog = ref.current
    if (!drag.current || !dialog) return
    drag.current.dy = Math.max(0, event.clientY - drag.current.startY)
    dialog.style.translate = `0 ${drag.current.dy}px`
  }
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dialog = ref.current
    const state = drag.current
    drag.current = null
    if (!dialog || !state) return
    dialog.style.translate = ''
    slide.current = slideThrough(dialog, state.dy)
    const velocity = state.dy / Math.max(1, event.timeStamp - state.startTime)
    // Far or fast enough: closing reverses the slide, carrying on down from the finger.
    if (state.dy > CLOSE_DISTANCE || (state.dy > 24 && velocity > CLOSE_VELOCITY)) onClose()
  }

  return (
    // Backdrop click is a pointer-only convenience; keyboard users close with Escape,
    // which the native dialog handles.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: let the sheet slide away like any other close.
        event.preventDefault()
        onClose()
      }}
      onClose={() => {
        if (openRef.current) onClose()
      }}
      onClick={(event) => {
        // Clicks on the backdrop target the dialog element itself.
        if (event.target === event.currentTarget) onClose()
      }}
      className={clsx(
        'fixed inset-x-0 top-auto bottom-[var(--keyboard,0px)] m-0 mx-auto w-full max-w-app overflow-x-hidden overscroll-contain',
        'max-h-[min(85dvh,calc(var(--visible,100dvh)-1rem))]',
        'sheet rounded-t-xl border-2 border-b-0 border-border bg-bg p-0 text-fg focus:outline-none',
      )}
    >
      <div ref={body} className="flex flex-col gap-4 px-4 pt-3 pb-safe-4">
        <div
          data-sheet-handle
          className="-mx-4 -mt-3 flex touch-none flex-col gap-4 px-4 pt-3"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-border" />
          <h2 id={titleId} className="text-title font-extrabold">
            {shown.title}
          </h2>
        </div>
        {open || shownInDialog ? shown.children : null}
      </div>
    </dialog>
  )
}
