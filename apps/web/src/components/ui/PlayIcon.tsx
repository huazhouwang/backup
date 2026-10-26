import { clsx } from 'clsx'

/** A chunky play triangle with rounded corners, for trying out a sound. */
export function PlayIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={clsx('shrink-0', className ?? 'size-6')}>
      <path
        d="M8 5.5v13l10-6.5z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  )
}
