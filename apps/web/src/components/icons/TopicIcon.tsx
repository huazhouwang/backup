import { cn } from '@lullabo/ui/utils'

export type Topic = 'sleep' | 'feeding' | 'play' | 'care' | 'safety'

/** A tip's topic: flat filled shapes, in the topic's colour (`currentColor`). */
export function TopicIcon({ topic, className }: { topic: Topic; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn('shrink-0', className ?? 'size-10')}>
      {topic === 'sleep' && (
        <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z" fill="currentColor" />
      )}
      {topic === 'feeding' && (
        <>
          <path d="M4 11h16a8 8 0 0 1-16 0Z" fill="currentColor" />
          <path
            d="M14 4l-2 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}
      {topic === 'play' && (
        <>
          <circle cx="9" cy="15" r="6" fill="currentColor" />
          <rect x="13" y="3" width="8" height="8" rx="2.5" fill="currentColor" />
        </>
      )}
      {topic === 'care' && (
        <path
          d="M12 20.5s-8-4.6-8-10.2A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 8 2.3c0 5.6-8 10.2-8 10.2Z"
          fill="currentColor"
        />
      )}
      {topic === 'safety' && (
        <path d="M12 2.5 20 6v6c0 4.8-3.4 8.4-8 9.5-4.6-1.1-8-4.7-8-9.5V6Z" fill="currentColor" />
      )}
    </svg>
  )
}
