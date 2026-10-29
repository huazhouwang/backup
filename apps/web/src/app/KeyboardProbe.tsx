import { useEffect, useRef } from 'react'

/**
 * Temporary: shows what iOS tells the page while its keyboard comes up, to find why a
 * field stays under the keyboard for seconds on an iPhone. Turned on and off by tapping
 * the version in Settings › About five times; off, it renders nothing.
 */
const KEY = 'lullabo.keyboardProbe'

export const probeOn = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function toggleProbe() {
  try {
    if (probeOn()) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, '1')
  } catch {
    // Without storage there is no probe.
  }
  location.reload()
}

const LINES = 24
const r = (value: number) => Math.round(value)

export function KeyboardProbe() {
  const panel = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const element = panel.current
    const viewport = window.visualViewport
    if (!element || !viewport || !probeOn()) return undefined
    const lines: string[] = []
    let since = performance.now()
    let last = ''
    const write = (text: string) => {
      lines.push(
        `${Math.round(performance.now() - since)
          .toString()
          .padStart(5)} ${text}`,
      )
      if (lines.length > LINES) lines.shift()
      element.textContent = lines.join('\n')
    }
    // The probe sits in the top layer, so a sheet opened after it would cover it.
    const raise = () => {
      if (!element.isConnected) return
      if (element.matches(':popover-open')) element.hidePopover()
      element.showPopover()
    }
    const state = () => {
      const field = document.activeElement
      const sheet = field?.closest('dialog')
      const rect = field instanceof HTMLInputElement ? field.getBoundingClientRect() : null
      return [
        `ih${window.innerHeight}`,
        `vh${r(viewport.height)}`,
        `vt${r(viewport.offsetTop)}`,
        `sy${r(window.scrollY)}`,
        rect ? `fb${r(rect.bottom)}` : 'f-',
        sheet
          ? `st${r(sheet.scrollTop)} kb${sheet.style.getPropertyValue('--keyboard') || '-'}`
          : '',
      ].join(' ')
    }
    let frame = 0
    const tick = () => {
      const now = state()
      if (now !== last) {
        write(now)
        last = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLInputElement) {
        since = performance.now()
        lines.length = 0
      }
      write(`focusin ${event.target instanceof Element ? event.target.tagName : '?'}`)
      raise()
    }
    const note = (name: string) => () => write(`> ${name}`)
    const onResize = note('vv resize')
    const onScroll = note('vv scroll')
    const onWindowScroll = note('win scroll')
    const onReveal = (event: Event) =>
      write(`> reveal ${event instanceof CustomEvent ? JSON.stringify(event.detail) : ''}`)
    const observer = new MutationObserver(raise)
    // Sheets are dialogs on the page all along; one opening sets its `open`.
    observer.observe(document.body, { subtree: true, attributeFilter: ['open'] })
    document.addEventListener('focusin', onFocus)
    viewport.addEventListener('resize', onResize)
    viewport.addEventListener('scroll', onScroll)
    window.addEventListener('scroll', onWindowScroll)
    document.addEventListener('keyboard-reveal', onReveal)
    raise()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('focusin', onFocus)
      viewport.removeEventListener('resize', onResize)
      viewport.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onWindowScroll)
      document.removeEventListener('keyboard-reveal', onReveal)
    }
  }, [])

  if (!probeOn()) return null
  return (
    <pre
      ref={panel}
      popover="manual"
      className="pointer-events-none fixed inset-x-0 top-0 bottom-auto m-0 h-auto w-full max-w-none border-0 bg-black/75 p-1 pt-[env(safe-area-inset-top)] font-mono text-[10px] leading-tight text-white"
    />
  )
}
