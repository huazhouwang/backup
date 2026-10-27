import type { PoopDetails } from '@lullabo/shared'

/** Fill colors for the stain on the diaper illustration. */
const POOP_FILL: Record<PoopDetails['color'], string> = {
  yellow: '#d9a400',
  brown: '#8b5a2b',
  green: '#6f7f3a',
  black: '#2b2b2b',
  red: '#c0392b',
  white: '#e4e4e4',
}

const WET_FILL = '#e8d77a'

/**
 * Flat open-diaper illustration: an hourglass pad with side tabs, plus an optional wet patch
 * and poop stain. Light colors on purpose, so it reads the same in light and dark themes.
 * `DiaperArt` is the artwork alone (120×90), for embedding in other icons.
 */
export function DiaperArt({ wet = false, poop }: { wet?: boolean; poop?: PoopDetails['color'] }) {
  return (
    <>
      {/* Side tabs */}
      <rect x="4" y="12" width="20" height="13" rx="4" fill="#cfe5d3" />
      <rect x="96" y="12" width="20" height="13" rx="4" fill="#cfe5d3" />
      {/* Diaper body: wide waistbands, narrow middle */}
      <path
        d="M18 8 H102 Q109 8 106 16 L90 38 Q84 46 90 54 L104 72 Q108 82 98 82 H22 Q12 82 16 72 L30 54 Q36 46 30 38 L14 16 Q11 8 18 8 Z"
        fill="#fbfbfb"
        stroke="#dcdcdc"
        strokeWidth="2"
      />
      {/* Absorbent pad */}
      <path
        d="M46 14 H74 Q79 14 77 20 L72 40 Q70 46 72 52 L77 70 Q78 76 73 76 H47 Q42 76 43 70 L48 52 Q50 46 48 40 L43 20 Q41 14 46 14 Z"
        fill="#efefef"
      />
      {wet && <ellipse cx="60" cy="46" rx="12" ry="20" fill={WET_FILL} opacity="0.55" />}
      {poop && (
        <path
          d="M56 34 Q64 29 66 38 Q72 45 66 52 Q69 60 60 62 Q51 61 54 52 Q48 45 55 39 Z"
          fill={POOP_FILL[poop]}
          stroke={poop === 'white' ? '#bdbdbd' : 'none'}
          strokeWidth="1.5"
        />
      )}
    </>
  )
}

export function DiaperIcon({
  wet = false,
  poop,
  className,
}: {
  wet?: boolean
  poop?: PoopDetails['color']
  className?: string
}) {
  return (
    <svg aria-hidden viewBox="0 0 120 90" className={className}>
      <DiaperArt wet={wet} poop={poop} />
    </svg>
  )
}
