import { type RefObject, useEffect } from 'react'

/**
 * iOS brings the keyboard up, and pans the page to the field, over several frames and in
 * more than one step, while telling the page only now and then. So after each sign of it
 * (a focus, a resize, a pan), `run` runs again every frame until things have settled.
 * Returns a way to start it, and one to stop for good.
 */
function untilSettled(run: () => void, ms = 1000) {
  let frame = 0
  let until = 0
  const tick = () => {
    run()
    frame = performance.now() < until ? requestAnimationFrame(tick) : 0
  }
  return {
    follow: () => {
      until = performance.now() + ms
      if (!frame) frame = requestAnimationFrame(tick)
    },
    stop: () => cancelAnimationFrame(frame),
  }
}

/**
 * How far the visible area starts below the top of the window, for what is fixed to the
 * window (a sheet). An app on the iPhone's home screen scrolls the page for the keyboard
 * and counts that scroll in the visual viewport's offset, though it moves only the page.
 */
function panOf(viewport: VisualViewport) {
  return Math.max(0, viewport.offsetTop - window.scrollY)
}

/**
 * iOS lays the keyboard over the page without resizing it, so whatever sits at the bottom
 * would end up behind it. While `active`, this keeps CSS variables on `ref`'s element with
 * the part of the screen still visible: `--visible-top` and `--visible` (its top and height)
 * and `--keyboard` (how much of the bottom is covered).
 */
export function useVisibleArea(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport
    const element = ref.current
    if (!active || !viewport || !element) return undefined
    const fit = () => {
      const pan = panOf(viewport)
      const covered = Math.max(0, window.innerHeight - viewport.height - pan)
      element.style.setProperty('--keyboard', `${covered}px`)
      element.style.setProperty('--visible', `${viewport.height}px`)
      element.style.setProperty('--visible-top', `${pan}px`)
    }
    fit()
    const settle = untilSettled(fit)
    const onChange = () => {
      fit()
      settle.follow()
    }
    viewport.addEventListener('resize', onChange)
    viewport.addEventListener('scroll', onChange)
    document.addEventListener('focusin', settle.follow)
    return () => {
      settle.stop()
      viewport.removeEventListener('resize', onChange)
      viewport.removeEventListener('scroll', onChange)
      document.removeEventListener('focusin', settle.follow)
      for (const name of ['--keyboard', '--visible', '--visible-top']) {
        element.style.removeProperty(name)
      }
    }
  }, [ref, active])
}

/**
 * Room kept under a field being typed in: iOS floats its toolbar (the arrows and ✓) over the
 * page just above the keyboard, and the visible area reported to the page still includes it.
 */
const TOOLBAR_ROOM = 64

/** Fields that bring up the keyboard; buttons, checkboxes and the like do not. */
const typedIn = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLTextAreaElement ||
  (element instanceof HTMLInputElement &&
    !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(
      element.type,
    ))

/**
 * While `active`, scrolls `ref`'s element (a scrolling sheet) so the field being typed in sits
 * above the keyboard and its toolbar: on focus, and again whenever the keyboard changes what
 * is visible.
 */
export function useFieldAboveKeyboard(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const element = ref.current
    if (!active || !element) return undefined
    const viewport = window.visualViewport
    const reveal = () => {
      const field = document.activeElement
      if (!typedIn(field) || !element.contains(field)) return
      // Whichever is higher: the keyboard's top or the sheet's own bottom.
      const bottom = Math.min(
        viewport ? panOf(viewport) + viewport.height : document.documentElement.clientHeight,
        element.getBoundingClientRect().bottom,
      )
      const over = field.getBoundingClientRect().bottom - (bottom - TOOLBAR_ROOM)
      if (over > 0) {
        element.scrollTop += over
        // Temporary, for the app's keyboard probe.
        document.dispatchEvent(
          new CustomEvent('keyboard-reveal', {
            detail: { over: Math.round(over), to: element.scrollTop },
          }),
        )
      }
    }
    // Again each frame while the keyboard comes up: at the focus it isn't there yet.
    const settle = untilSettled(reveal)
    const onChange = () => {
      reveal()
      settle.follow()
    }
    element.addEventListener('focusin', onChange)
    viewport?.addEventListener('resize', onChange)
    viewport?.addEventListener('scroll', onChange)
    return () => {
      settle.stop()
      element.removeEventListener('focusin', onChange)
      viewport?.removeEventListener('resize', onChange)
      viewport?.removeEventListener('scroll', onChange)
    }
  }, [ref, active])
}

const KEEPER_ID = 'keyboard-keeper'

/**
 * iOS raises the keyboard only for a focus within a tap. Called in the tap that opens a page
 * with a field, this focuses a hidden field that outlives the page change; the page's own
 * field takes the focus, and the keyboard, when it mounts.
 */
export function holdKeyboard() {
  document.getElementById(KEEPER_ID)?.focus()
}

/** The hidden field `holdKeyboard` focuses, rendered once by the app's layout. */
export function KeyboardKeeper() {
  return (
    <input
      id={KEEPER_ID}
      aria-hidden
      tabIndex={-1}
      className="pointer-events-none fixed top-0 left-0 size-px opacity-0"
    />
  )
}
