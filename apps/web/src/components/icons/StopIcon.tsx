import { cn } from '@lullabo/ui/utils'

/** A chunky rounded square, for stopping a recording. */
export function StopIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn('shrink-0', className ?? 'size-6')}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="3.5" fill="currentColor" />
    </svg>
  )
}
