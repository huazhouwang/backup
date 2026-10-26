import { clsx } from 'clsx'

/** A bold round-capped tick. */
export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={clsx('shrink-0', className ?? 'size-6')}>
      <path
        d="m5.5 12.5 4.5 4.5 8.5-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
