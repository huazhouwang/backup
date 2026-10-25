import { clsx } from 'clsx'

/** A chunky microphone: a filled capsule in a round-capped cradle on a stand. */
export function MicIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={clsx('shrink-0', className ?? 'size-6')}>
      <rect x="8" y="2" width="8" height="13" rx="4" fill="currentColor" />
      <path
        d="M5 11.5 A7 7 0 0 0 19 11.5 M12 18.5 V21.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
