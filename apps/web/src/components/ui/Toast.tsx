import type { CSSProperties, ReactNode } from 'react'
import { type ExternalToast, Toaster as SonnerToaster, toast } from 'sonner'

import { Bun } from './Bun'

// Below the status bar, over the top of the page (the baby switcher), so toasts never cover
// the list at the bottom or the logging buttons; sonner positions the stack itself.
const top = 'calc(0.75rem + env(safe-area-inset-top))'

// As wide as `max-w-md`, the width the toasts had before.
const toasterStyle: CSSProperties & Record<'--width', string> = { '--width': '28rem' }

/** Hosts the app's toasts at the top of the screen; several stack, newest in front. */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset={{ top }}
      mobileOffset={{ top, left: '1rem', right: '1rem' }}
      style={toasterStyle}
      toastOptions={{
        unstyled: true,
        classNames: {
          // A card with a solid bottom edge, like the rest of the app; colours come per tone.
          toast:
            'flex w-full items-center justify-between gap-3 rounded-xl border-2 border-b-4 px-4 py-3 font-bold',
          icon: 'shrink-0',
          content: 'flex-1',
          actionButton:
            'press inline-flex min-h-touch shrink-0 items-center rounded-lg border-b-4 border-primary-edge bg-primary px-4 font-extrabold text-on-accent',
        },
      }}
    />
  )
}

export type ToastTone = 'neutral' | 'success' | 'error'

const tones: Record<ToastTone, string> = {
  neutral: 'border-border bg-bg text-fg',
  success: 'border-primary/40 bg-primary-soft text-primary-text',
  error: 'border-danger/40 bg-danger-soft text-danger-text',
}

export interface ToastOptions {
  tone?: ToastTone
  /** Shown before the message. */
  icon?: ReactNode
  /** Replaces the toast with the same id instead of stacking another. */
  id?: string
  action?: { label: string; onClick: () => void }
  /** Milliseconds on screen; `Infinity` keeps it until acted on or swiped away. */
  duration?: number
  onDismiss?: () => void
}

const DEFAULT_DURATION_MS = 4000

/** Shows a toast; screen readers hear it through sonner's live region. */
export function showToast(message: string, options: ToastOptions = {}) {
  const external: ExternalToast = {
    id: options.id,
    className: tones[options.tone ?? 'neutral'],
    // Done, or gone wrong: the bun says it too.
    icon:
      options.icon ??
      (options.tone === 'success' ? (
        <Bun mood="happy" className="size-8" />
      ) : options.tone === 'error' ? (
        <Bun mood="oops" className="size-8" />
      ) : undefined),
    duration: options.duration ?? DEFAULT_DURATION_MS,
    onDismiss: options.onDismiss,
    action: options.action,
  }
  return toast(message, external)
}

export const dismissToast = (id: string) => toast.dismiss(id)
