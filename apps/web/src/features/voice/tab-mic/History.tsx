import { useBounce } from '@lullabo/ui/bounce'
import { type ReactNode, useRef } from 'react'

/**
 * The conversation since the overlay opened, down by the microphone where the frost is
 * thickest. Long, it scrolls (and bounces), keeping the newest in view whenever `follow`
 * changes.
 */
export function History({ follow, children }: { follow: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  useBounce(scroller, { axes: ['y'] })
  return (
    <div
      ref={scroller}
      data-scrolls
      className="-mx-4 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4"
      role="log"
      aria-live="polite"
    >
      <div className="mt-auto flex flex-col gap-3 py-2">
        {children}
        {/* Remounts when something changes at the end, scrolling it into view. */}
        <div key={follow} ref={(node) => node?.scrollIntoView({ block: 'end' })} />
      </div>
    </div>
  )
}
