import { cn } from '@lullabo/ui/utils'

// The tab bar's icons: chunky, round-capped strokes on a 24 grid, in the tab's colour.

const props = (className?: string) => ({
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  className: cn('size-6 shrink-0', className),
})
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** A house, for Today. */
export function TodayIcon({ className }: { className?: string }) {
  return (
    <svg {...props(className)}>
      <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1Z" {...stroke} />
    </svg>
  )
}

/** Three bars, for Stats. */
export function StatsIcon({ className }: { className?: string }) {
  return (
    <svg {...props(className)}>
      <path d="M5 20v-8M12 20V5M19 20v-6" {...stroke} />
    </svg>
  )
}

/** A light bulb, for Tips. */
export function TipsIcon({ className }: { className?: string }) {
  return (
    <svg {...props(className)}>
      <path
        d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V17h5v-1.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z"
        fill="currentColor"
      />
      <path d="M10 20.5h4" {...stroke} />
    </svg>
  )
}

/** A cog, for Settings. */
export function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg {...props(className)}>
      <circle cx="12" cy="12" r="3.2" {...stroke} />
      <path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"
        {...stroke}
      />
    </svg>
  )
}
