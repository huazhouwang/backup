import { cn } from '@lullabo/ui/utils'

/** A chunky pencil, for "change this" buttons. */
export function EditIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn('shrink-0', className ?? 'size-5')}>
      <g transform="rotate(45 12 12)">
        {/* Body, with the eraser band a shade lighter. */}
        <rect x="8.5" y="1.5" width="7" height="15" rx="2" fill="currentColor" />
        <rect x="8.5" y="4.5" width="7" height="2.5" fill="currentColor" opacity="0.55" />
        <path d="M8.5 17.5 H15.5 L12.9 22.2 Q12 23.4 11.1 22.2 Z" fill="currentColor" />
      </g>
    </svg>
  )
}
