import { Drawer } from '@base-ui/react/drawer'
import {
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { useBounce } from '../lib/bounce'
import { useFieldAboveKeyboard, useVisibleArea } from '../lib/keyboard'
import { prefersReducedMotion } from '../lib/motion'
import { lockScroll } from '../lib/scroll-lock'
import { cn } from '../lib/utils'

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
function slideThrough(popup: HTMLElement, dy: number) {
  const animation = popup.animate(
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
 * Bottom sheet on Base UI's Drawer, which provides the portal, focus trapping, Escape and a
 * tap outside to close, and an inert background. The motion is the sheet's own: it slides
 * in with a little bounce, follows a drag on its header, and every way of closing plays the
 * slide backwards; Base UI keeps it open until that has finished. Used instead of centered
 * modals for forms.
 */
// Touches that are someone else's: the header's drag, or a control marked data-sheet-still
// (a button held to talk), which the sheet's content must not bounce under.
const onHandle = (target: Element) =>
  target.closest('[data-sheet-handle], [data-sheet-still]') !== null

export function Sheet({ open, onClose, title, children }: SheetProps) {
  // The popup, once Base UI has mounted it in its portal.
  const [popup, setPopup] = useState<HTMLDivElement | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  // Focused before the sheet opened: focus goes back there when it closes, if it is still on
  // the page (a sheet that opened this one has gone) and no other sheet holds it, as a
  // dialog's close() did.
  const returnFocus = useRef<HTMLElement | null>(null)
  const drag = useRef<{ startY: number; startTime: number; dy: number } | null>(null)
  // The current slide; reversing it closes the sheet (or reopens it mid-close).
  const slide = useRef<Animation | null>(null)
  // Parents usually drop the sheet's content as soon as it closes; keep showing what was
  // there until the slide away has finished, so the sheet leaves whole instead of
  // collapsing first. Once closed, the content unmounts.
  const shown = useLastOpen(open, { title, children })
  // True from opening until the closing slide has finished: Base UI keeps the sheet up
  // that long. Set as soon as `open` is, during the same render.
  const [shownInDialog, setShownInDialog] = useState(false)
  if (open && !shownInDialog) setShownInDialog(true)
  // Sliding away: the backdrop fades with it, and nothing in it reacts any more.
  const closing = !open && shownInDialog

  // Mounted: the slide in starts before the first paint, so the sheet never shows in place
  // first.
  const attach = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const active = document.activeElement
      returnFocus.current = active instanceof HTMLElement ? active : null
    }
    ref.current = node
    setPopup(node)
    if (node && !slide.current && !prefersReducedMotion()) {
      slide.current = node.animate(SLIDE, SLIDE_TIMING)
    }
    if (!node) slide.current = null
  }, [])

  useEffect(() => {
    if (!popup) return undefined
    if (open) {
      if (
        slide.current &&
        slide.current.playState !== 'finished' &&
        slide.current.playbackRate < 0
      ) {
        // Reopened while sliding away: play the slide forwards again.
        slide.current.reverse()
        return undefined
      }
      return undefined
    }
    const current = slide.current
    if (!current) {
      // No slide (reduced motion): closed at once, as the dialog's close() was.
      setShownInDialog(false)
      return undefined
    }
    // Every way of closing (backdrop, Escape, a drag, the parent) plays the slide backwards,
    // then closes; the backdrop fades with it.
    if (current.playbackRate > 0) current.reverse()
    let cancelled = false
    current.finished
      .then(() => {
        if (cancelled) return
        setShownInDialog(false)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, popup])

  // The page behind stays put while the sheet is up, even on a sheet too short to scroll.
  useEffect(() => (shownInDialog ? lockScroll() : undefined), [shownInDialog])

  // Dragging the header pulls the sheet down; far or fast enough, it closes.
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    // The finger moves the sheet now; a running slide would hold it in place.
    slide.current?.cancel()
    drag.current = { startY: event.clientY, startTime: event.timeStamp, dy: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const sheet = ref.current
    if (!drag.current || !sheet) return
    drag.current.dy = Math.max(0, event.clientY - drag.current.startY)
    sheet.style.translate = `0 ${drag.current.dy}px`
  }
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const sheet = ref.current
    const state = drag.current
    drag.current = null
    if (!sheet || !state) return
    sheet.style.translate = ''
    slide.current = slideThrough(sheet, state.dy)
    const velocity = state.dy / Math.max(1, event.timeStamp - state.startTime)
    // Far or fast enough: closing reverses the slide, carrying on down from the finger.
    if (state.dy > CLOSE_DISTANCE || (state.dy > 24 && velocity > CLOSE_VELOCITY)) onClose()
  }

  return (
    <Drawer.Root
      open={open || shownInDialog}
      onOpenChange={(next) => {
        // Escape or a tap outside: slide away like any other close.
        if (!next && open) onClose()
      }}
    >
      <Drawer.Portal>
        <Drawer.Backdrop
          data-closing={closing ? '' : undefined}
          className="sheet-backdrop fixed inset-0 z-(--layer-sheet)"
        />
        <Drawer.Popup
          ref={attach}
          data-slot="sheet"
          data-closing={closing ? '' : undefined}
          // No Base UI swipe: the sheet's header drag and content bounce handle touches.
          data-base-ui-swipe-ignore=""
          initialFocus={ref}
          finalFocus={() => {
            // Handed over to another sheet: focus stays in that one, the page being inert.
            const others = [...document.querySelectorAll('[data-slot=sheet]')].some(
              (sheet) => sheet !== ref.current,
            )
            return !others && returnFocus.current?.isConnected ? returnFocus.current : false
          }}
          className={cn(
            'fixed inset-x-0 top-auto bottom-[var(--keyboard,0px)] z-(--layer-sheet) m-0 mx-auto w-full max-w-app overflow-x-hidden overscroll-contain',
            'max-h-[min(85dvh,calc(var(--visible,100dvh)-1rem))]',
            'sheet rounded-t-xl border-2 border-b-0 border-border bg-card p-0 text-card-foreground focus:outline-none',
          )}
        >
          <SheetBody sheet={ref}>
            <div
              data-sheet-handle
              className="-mx-4 -mt-3 flex touch-none flex-col gap-4 px-4 pt-3"
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-border" />
              <Drawer.Title className="text-title font-extrabold">{shown.title}</Drawer.Title>
            </div>
            {open || shownInDialog ? shown.children : null}
          </SheetBody>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/**
 * The sheet's content. Mounted with the popup, so its effects find the popup in place:
 * the content bounces at its ends (the header's own drag is left alone), and the sheet
 * rests on the iOS keyboard, fits above it and keeps the field typed in above its toolbar.
 */
function SheetBody({
  sheet,
  children,
}: {
  sheet: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const body = useRef<HTMLDivElement>(null)
  useBounce(sheet, { axes: ['y'], content: body, ignore: onHandle })
  useVisibleArea(sheet, true)
  useFieldAboveKeyboard(sheet, true)
  return (
    <div ref={body} className="flex flex-col gap-4 px-4 pt-3 pb-safe-4">
      {children}
    </div>
  )
}
