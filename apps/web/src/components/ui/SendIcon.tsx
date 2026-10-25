import { clsx } from 'clsx'

/** A chunky arrow pointing up, for sending what was said. */
export function SendIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={clsx('shrink-0', className ?? 'size-6')}>
      <path
        d="M12 20V5M5 11.5 12 4.5l7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
