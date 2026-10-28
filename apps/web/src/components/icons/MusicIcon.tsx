import { cn } from '@lullabo/ui/utils'

/** Two notes joined by a beam: filled heads on round-capped stems. */
export function MusicIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn('shrink-0', className ?? 'size-6')}>
      <path
        d="M9.5 17.5 V5.5 L20 3.5 V15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="17.5" r="3.5" fill="currentColor" />
      <circle cx="17" cy="15.5" r="3.5" fill="currentColor" />
    </svg>
  )
}
