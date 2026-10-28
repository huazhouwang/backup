import type { AvatarColor } from '@lullabo/shared'
import { cn } from '@lullabo/ui/utils'

export const avatarBackground: Record<AvatarColor, string> = {
  green: 'bg-avatar-green',
  blue: 'bg-diaper',
  orange: 'bg-feeding',
  purple: 'bg-sleep',
  pink: 'bg-avatar-pink',
  yellow: 'bg-avatar-yellow',
}

export function BabyAvatar({
  name,
  color,
  size = 'md',
}: {
  name: string
  color: AvatarColor
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-primary-foreground',
        size === 'sm'
          ? 'size-8 text-caption'
          : size === 'md'
            ? 'size-10 text-body'
            : 'size-14 text-title',
        avatarBackground[color],
      )}
    >
      {Array.from(name)[0] ?? ''}
    </span>
  )
}
