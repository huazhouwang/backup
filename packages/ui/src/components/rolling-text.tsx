import { AnimatePresence, m as motion } from 'motion/react'

import { rollUp } from '../lib/motion'

/** Text that rolls up when its value changes, for live figures like "2小时前". */
export function RollingText({ children }: { children: string }) {
  return (
    <span className="relative inline-flex overflow-hidden align-bottom">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={children} {...rollUp}>
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
