import { cn } from '@lullabo/ui/utils'

/** A camera: a filled rounded body with its bump on top and a round lens cut out. */
export function CameraIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn('shrink-0', className ?? 'size-6')}>
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M9.2 3.5h5.6a2 2 0 0 1 1.7 1l.9 1.5H19a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h1.6l.9-1.5a2 2 0 0 1 1.7-1ZM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
      />
    </svg>
  )
}
