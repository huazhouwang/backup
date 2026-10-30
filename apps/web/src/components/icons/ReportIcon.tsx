import { cn } from '@lullabo/ui/utils'

/** A clipboard: a filled rounded board, its clip on top, two lines of writing cut out. */
export function ReportIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn('shrink-0', className ?? 'size-6')}>
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M9 2.5h6a1.5 1.5 0 0 1 1.5 1.5v.5H18a2.5 2.5 0 0 1 2.5 2.5v12.5A2.5 2.5 0 0 1 18 21.5H6A2.5 2.5 0 0 1 3.5 19V7A2.5 2.5 0 0 1 6 4.5h1.5V4A1.5 1.5 0 0 1 9 2.5ZM8 11.5a1.25 1.25 0 0 0 0 2.5h8a1.25 1.25 0 0 0 0-2.5H8Zm0 4a1.25 1.25 0 0 0 0 2.5h5a1.25 1.25 0 0 0 0-2.5H8Z"
      />
    </svg>
  )
}
