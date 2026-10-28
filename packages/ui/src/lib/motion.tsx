import { LazyMotion, MotionConfig, domMax } from 'motion/react'
import type { ReactNode } from 'react'

/** Quick spring with a touch of bounce, shared by moving indicators and list items. */
export const spring = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 } as const

/** Motion for the app: `m.*` components, honouring the system's reduced-motion setting. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={spring}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}

/** The system asks for less motion; animations driven from code should skip themselves. */
export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** A small bounce for a control that just turned on (a chip, a toggle). */
export function popElement(element: HTMLElement) {
  if (prefersReducedMotion()) return
  element.animate([{ scale: 1 }, { scale: 1.07 }, { scale: 1 }], {
    duration: 240,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  })
}

/*
 * Shared motion presets, spread onto `motion.*` elements so the same kind of change moves
 * the same way everywhere: `<motion.li {...rowInOut} />`.
 */

/** A list row: drops in from just above, folds away when removed. */
export const rowInOut = {
  initial: { opacity: 0, y: -12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, height: 0 },
} as const

/** A message arriving at the end of a conversation: rises into place, pushing the earlier up. */
export const riseIn = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
} as const

/** A highlight laid over something new, fading out once it has been noticed. */
export const glowOnce = {
  initial: { opacity: 1 },
  animate: { opacity: 0 },
  transition: { duration: 1.2, delay: 0.3, ease: 'easeOut' },
} as const

/** Text replaced by its next value: the old one rolls up and out, the new one in. */
export const rollUp = {
  initial: { y: '100%', opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: '-100%', opacity: 0 },
} as const

/**
 * A card that grows into place and shrinks away. Its spacing below (px) grows with it,
 * so the content after it moves smoothly instead of jumping by the gap.
 */
export function growInOut(spacing: number) {
  const hidden = { height: 0, paddingBottom: 0, opacity: 0, scale: 0.96 }
  return {
    initial: hidden,
    animate: { height: 'auto', paddingBottom: spacing, opacity: 1, scale: 1 },
    exit: hidden,
  } as const
}

/**
 * Content swapped for the next or previous page of it (a day): slides in from the side
 * moved towards. Pass the direction (1 forwards, -1 back) as `custom` on the element and
 * on its AnimatePresence.
 */
export const slideFromSide = {
  variants: {
    enter: (direction: number) => ({ opacity: 0, x: direction * 32 }),
    center: { opacity: 1, x: 0 },
    exit: (direction: number) => ({
      opacity: 0,
      x: direction * -32,
      transition: { duration: 0.1 },
    }),
  },
  initial: 'enter',
  animate: 'center',
  exit: 'exit',
} as const
