import type { Event, PoopDetails } from '@lullabo/shared'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'

import type { Category } from './category'
import { DiaperArt } from './DiaperArt'

/** Icon subjects: each category, with feeds and sleeps split by kind. */
export type IconKind =
  | 'bottle'
  | 'breast'
  | 'solids'
  | 'sleep'
  | 'nap'
  | 'diaper'
  | 'diaperWet'
  | 'diaperDirty'
  | 'diaperMixed'
  | 'pumping'
  | 'temperature'
  | 'medication'
  | 'note'
  | 'growth'

const DIAPER_KIND = { wet: 'diaperWet', dirty: 'diaperDirty', mixed: 'diaperMixed' } as const

const CATEGORY_KIND: Record<Category, IconKind> = {
  feeding: 'bottle',
  sleep: 'sleep',
  diaper: 'diaper',
  pumping: 'pumping',
  temperature: 'temperature',
  medication: 'medication',
  note: 'note',
  growth: 'growth',
}

function iconKindOf(event: Event): IconKind {
  if (event.type === 'feeding') return event.data.kind
  if (event.type === 'sleep') return event.data.kind === 'nap' ? 'nap' : 'sleep'
  if (event.type === 'diaper') return DIAPER_KIND[event.data.contents]
  return CATEGORY_KIND[event.type]
}

/** Icon props for a record, including the stool color it was logged with. */
export function eventIconProps(event: Event): { kind: IconKind; poop?: PoopColor } {
  const kind = iconKindOf(event)
  return event.type === 'diaper' && event.data.poop
    ? { kind, poop: event.data.poop.color }
    : { kind }
}

export const categoryIconKind = (category: Category): IconKind => CATEGORY_KIND[category]

/** Fill class of each kind's color; also used for details drawn in that color. */
const TONE: Record<IconKind, string> = {
  bottle: 'fill-feeding',
  breast: 'fill-feeding',
  solids: 'fill-feeding',
  sleep: 'fill-sleep',
  nap: 'fill-sleep',
  diaper: 'fill-diaper',
  diaperWet: 'fill-diaper',
  diaperDirty: 'fill-diaper',
  diaperMixed: 'fill-diaper',
  pumping: 'fill-pumping',
  temperature: 'fill-danger',
  medication: 'fill-medication',
  note: 'fill-note',
  growth: 'fill-primary',
}

const W = '#ffffff'
type PoopColor = PoopDetails['color']

/** Flat white artwork on a 48×48 grid; `tone` paints details in the kind's color. */
function glyph(kind: IconKind, tone: string, poop: PoopColor): ReactNode {
  switch (kind) {
    case 'bottle':
      return (
        <>
          <path d="M21 8 Q24 3 27 8 V12 H21 Z" fill={W} />
          <rect x="17" y="11" width="14" height="5" rx="2" fill={W} />
          <rect x="16" y="16" width="16" height="26" rx="5" fill={W} />
          <rect x="18.5" y="27" width="11" height="12.5" rx="3" className={tone} opacity="0.35" />
          <rect x="18.5" y="21" width="5" height="2" rx="1" className={tone} />
          <rect x="18.5" y="27" width="5" height="2" rx="1" className={tone} />
          <rect x="18.5" y="33" width="5" height="2" rx="1" className={tone} />
        </>
      )
    case 'breast':
      return (
        <>
          <path d="M24 7 C24 7 12 21 12 29 A12 12 0 0 0 36 29 C36 21 24 7 24 7 Z" fill={W} />
          <path
            d="M24 35.5 L19 30.5 A3.2 3.2 0 0 1 24 26.3 A3.2 3.2 0 0 1 29 30.5 Z"
            className={tone}
          />
        </>
      )
    case 'solids':
      return (
        <>
          <rect x="29" y="5" width="4" height="17" rx="2" fill={W} transform="rotate(28 31 13)" />
          <ellipse cx="24" cy="24" rx="13" ry="4.5" className={tone} opacity="0.5" />
          <path d="M9 24 H39 A15 13 0 0 1 9 24 Z" fill={W} />
          <rect x="18" y="36" width="12" height="4" rx="2" fill={W} />
        </>
      )
    case 'sleep':
      return (
        <>
          <circle cx="22" cy="26" r="14" fill={W} />
          <circle cx="29.5" cy="19.5" r="11" className={tone} />
          <path
            d="M36 8 L37.6 11.9 L41.5 13.5 L37.6 15.1 L36 19 L34.4 15.1 L30.5 13.5 L34.4 11.9 Z"
            fill={W}
          />
        </>
      )
    case 'nap':
      return (
        <>
          <circle cx="17" cy="30" r="7.5" fill={W} />
          <circle cx="25" cy="26" r="9.5" fill={W} />
          <circle cx="33" cy="31" r="6.5" fill={W} />
          <rect x="11" y="30" width="28" height="8" rx="4" fill={W} />
          <path
            d="M30 8 H37 L30 15 H37"
            fill="none"
            stroke={W}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )
    case 'diaper':
    case 'diaperWet':
    case 'diaperDirty':
    case 'diaperMixed':
      // The same illustration as the diaper form, with the stool in its logged color.
      return (
        <svg x="4" y="9" width="40" height="30" viewBox="0 0 120 90">
          <DiaperArt
            wet={kind === 'diaperWet' || kind === 'diaperMixed'}
            poop={kind === 'diaperDirty' || kind === 'diaperMixed' ? poop : undefined}
          />
        </svg>
      )
    case 'pumping':
      return (
        <>
          <path d="M11 9 H37 L28.5 20 H19.5 Z" fill={W} />
          <rect x="20" y="19" width="8" height="5" fill={W} />
          <rect x="17" y="23" width="14" height="18" rx="4" fill={W} />
          <rect x="19.5" y="31" width="9" height="8" rx="2.5" className={tone} opacity="0.4" />
        </>
      )
    case 'temperature':
      return (
        <>
          <rect x="19" y="6" width="10" height="26" rx="5" fill={W} />
          <circle cx="24" cy="34" r="8.5" fill={W} />
          <rect x="22.5" y="15" width="3" height="18" rx="1.5" className={tone} />
          <circle cx="24" cy="34" r="5" className={tone} />
          <rect x="31" y="10" width="6" height="2.4" rx="1.2" fill={W} />
          <rect x="31" y="16" width="4" height="2.4" rx="1.2" fill={W} />
          <rect x="31" y="22" width="6" height="2.4" rx="1.2" fill={W} />
        </>
      )
    case 'medication':
      return (
        <g transform="rotate(-40 24 24)">
          <rect x="9" y="17" width="30" height="14" rx="7" fill={W} />
          <path d="M24 17 H32 A7 7 0 0 1 32 31 H24 Z" className={tone} opacity="0.45" />
          <rect x="13" y="20" width="7" height="2.4" rx="1.2" className={tone} opacity="0.5" />
        </g>
      )
    case 'note':
      return (
        <>
          <rect x="12" y="7" width="24" height="34" rx="4" fill={W} />
          <rect x="17" y="15" width="14" height="2.6" rx="1.3" className={tone} />
          <rect x="17" y="21.5" width="14" height="2.6" rx="1.3" className={tone} />
          <rect x="17" y="28" width="9" height="2.6" rx="1.3" className={tone} />
        </>
      )
    case 'growth':
      return (
        <>
          <rect x="16" y="5" width="16" height="38" rx="3.5" fill={W} />
          {[10, 16, 22, 28, 34].map((y, i) => (
            <rect
              key={y}
              x="16"
              y={y}
              width={i % 2 ? 10 : 6}
              height="2.4"
              rx="1.2"
              className={tone}
            />
          ))}
        </>
      )
    default:
      return kind satisfies never
  }
}

/**
 * Flat cartoon icon for an event kind. `badge` sits the artwork on a circle in the kind's
 * color (lists, cards); `plain` draws only the artwork, for buttons already in that color.
 */
export function EventIcon({
  kind,
  poop = 'yellow',
  variant = 'badge',
  className,
}: {
  kind: IconKind
  /** Stool color for dirty and mixed diapers; most baby stool is yellow. */
  poop?: PoopColor
  variant?: 'badge' | 'plain'
  className?: string
}) {
  const tone = TONE[kind]
  return (
    <svg aria-hidden viewBox="0 0 48 48" className={clsx('shrink-0', className)}>
      {variant === 'badge' && <circle cx="24" cy="24" r="24" className={tone} />}
      {glyph(kind, tone, poop)}
    </svg>
  )
}
