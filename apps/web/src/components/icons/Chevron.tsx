import { cn } from '@lullabo/ui/utils'

const paths = {
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  down: 'M5 9l7 7 7-7',
} as const

/**
 * A bold chevron: `right` on rows that open a page, `left` for going back or earlier, `down`
 * for putting away a page that slid up.
 */
export function Chevron({
  direction = 'right',
  className,
}: {
  direction?: keyof typeof paths
  /** Size and colour; muted and 20px by default. */
  className?: string
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn('shrink-0', className ?? 'size-5 text-muted-foreground')}
    >
      <path
        d={paths[direction]}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
