import { cn } from '@lullabo/ui/utils'
import { Link, type LinkProps } from '@tanstack/react-router'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface RowContent {
  /** Before the text: an avatar or icon. */
  leading?: ReactNode
  title: ReactNode
  /** A muted second line, cut to fit unless `detailWraps`. */
  detail?: ReactNode
  detailWraps?: boolean
  /** After the text: a chevron, a tick, a pill. */
  trailing?: ReactNode
}

export type ListRowProps = RowContent &
  (
    | { link: LinkProps; className?: string }
    | ({ link?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'>)
  )

const rowClass = 'press-row flex min-h-touch w-full items-center gap-3 py-2 text-left'

function Content({ leading, title, detail, detailWraps, trailing }: RowContent) {
  return (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2 font-extrabold">{title}</span>
        {detail !== undefined && (
          <span className={cn('text-caption text-muted-foreground', !detailWraps && 'truncate')}>
            {detail}
          </span>
        )}
      </span>
      {trailing}
    </>
  )
}

/**
 * One tappable row of a list: a button, or a link when given `link`. Every list (settings,
 * babies, members, measurements, models) uses it, so rows share one height and press style.
 */
export function ListRow(props: ListRowProps) {
  const { leading, title, detail, detailWraps, trailing } = props
  const content = (
    <Content
      leading={leading}
      title={title}
      detail={detail}
      detailWraps={detailWraps}
      trailing={trailing}
    />
  )
  if (props.link) {
    return (
      <Link {...props.link} className={cn(rowClass, props.className)}>
        {content}
      </Link>
    )
  }
  const {
    link: _link,
    leading: _leading,
    title: _title,
    detail: _detail,
    detailWraps: _detailWraps,
    trailing: _trailing,
    className,
    type = 'button',
    ...button
  } = props
  return (
    <button type={type} className={cn(rowClass, className)} {...button}>
      {content}
    </button>
  )
}
