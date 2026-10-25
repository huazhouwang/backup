import { clsx } from 'clsx'

/** A chunky speech bubble with three dots, for talking to the assistant. */
export function ChatIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={clsx('shrink-0', className ?? 'size-6')}>
      <path
        d="M5 3.5 H19 Q22 3.5 22 6.5 V14.5 Q22 17.5 19 17.5 H11 L6.5 21.2 Q5.5 22 5.5 20.7 V17.5 H5 Q2 17.5 2 14.5 V6.5 Q2 3.5 5 3.5 Z"
        fill="currentColor"
      />
      <g fill="var(--color-surface)">
        <circle cx="7.5" cy="10.5" r="1.6" />
        <circle cx="12" cy="10.5" r="1.6" />
        <circle cx="16.5" cy="10.5" r="1.6" />
      </g>
    </svg>
  )
}
