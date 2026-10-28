import { type RefObject, useEffect } from 'react'

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
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      element.style.setProperty('--keyboard', `${covered}px`)
      element.style.setProperty('--visible', `${viewport.height}px`)
      element.style.setProperty('--visible-top', `${viewport.offsetTop}px`)
    }
    fit()
    viewport.addEventListener('resize', fit)
    viewport.addEventListener('scroll', fit)
    return () => {
      viewport.removeEventListener('resize', fit)
      viewport.removeEventListener('scroll', fit)
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
        viewport ? viewport.offsetTop + viewport.height : document.documentElement.clientHeight,
        element.getBoundingClientRect().bottom,
      )
      const over = field.getBoundingClientRect().bottom - (bottom - TOOLBAR_ROOM)
      if (over > 0) element.scrollTop += over
    }
    element.addEventListener('focusin', reveal)
    viewport?.addEventListener('resize', reveal)
    viewport?.addEventListener('scroll', reveal)
    return () => {
      element.removeEventListener('focusin', reveal)
      viewport?.removeEventListener('resize', reveal)
      viewport?.removeEventListener('scroll', reveal)
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
