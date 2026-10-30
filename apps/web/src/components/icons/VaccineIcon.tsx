import { cn } from '@lullabo/ui/utils'

/** A syringe on a slant: a filled barrel with a plunger, a needle, round-capped. */
export function VaccineIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn('shrink-0', className ?? 'size-6')}>
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        {/* Needle, and the plunger's handle. */}
        <path d="M5 19 3 21M17.5 6.5 21 3M19 8.5 15.5 5" />
      </g>
      <rect
        x="8.5"
        y="4.5"
        width="6"
        height="13"
        rx="2"
        transform="rotate(45 11.5 11)"
        fill="currentColor"
      />
    </svg>
  )
}
