import { cn } from '@lullabo/ui/utils'

/** A plus: two bold round-capped strokes. */
export function PlusIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn('shrink-0', className ?? 'size-6')}>
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
