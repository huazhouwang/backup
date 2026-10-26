import { useState } from 'react'
import { createPortal } from 'react-dom'

import { prefersReducedMotion } from '../../lib/motion'

/** The app's record colours, flat, as the paper pieces. */
const COLORS = [
  'var(--color-primary)',
  'var(--color-feeding)',
  'var(--color-sleep)',
  'var(--color-diaper)',
  'var(--color-pumping)',
]
const PIECES = 48
const LONGEST_MS = 2_600

interface Piece {
  id: string
  /** Where across the screen it starts (%). */
  left: number
  size: number
  round: boolean
  color: string
  fall: Keyframe[]
  timing: KeyframeAnimationOptions
}

function newPieces(burst: number): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => {
    const drift = (Math.random() - 0.5) * 160
    const spin = (Math.random() - 0.5) * 1080
    return {
      id: `${burst}-${i}`,
      left: Math.random() * 100,
      size: 8 + Math.random() * 6,
      round: i % 3 === 0,
      color: COLORS[i % COLORS.length] ?? 'var(--color-primary)',
      fall: [
        { translate: '0 -10vh', rotate: '0deg', opacity: 1 },
        { opacity: 1, offset: 0.8 },
        { translate: `${drift}px 105vh`, rotate: `${spin}deg`, opacity: 0 },
      ],
      timing: {
        duration: 1300 + Math.random() * 900,
        delay: Math.random() * 250,
        easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)',
        fill: 'both',
      },
    }
  })
}

/**
 * Flat paper pieces falling across the screen once, for something worth celebrating.
 * `fire` lets them fall; `confetti` goes anywhere in the page. Skipped with reduced motion.
 */
export function useConfetti() {
  const [pieces, setPieces] = useState<Piece[]>([])
  const fire = () => {
    if (prefersReducedMotion()) return
    const burst = Date.now()
    setPieces(newPieces(burst))
    setTimeout(() => {
      setPieces((current) => (current[0]?.id.startsWith(`${burst}-`) ? [] : current))
    }, LONGEST_MS)
  }
  const confetti =
    pieces.length > 0
      ? createPortal(
          <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            {pieces.map((piece) => (
              <span
                key={piece.id}
                ref={(node) => {
                  node?.animate(piece.fall, piece.timing)
                }}
                className="absolute top-0"
                style={{
                  left: `${piece.left}%`,
                  width: piece.size,
                  height: piece.round ? piece.size : piece.size * 0.6,
                  borderRadius: piece.round ? 999 : 2,
                  background: piece.color,
                }}
              />
            ))}
          </div>,
          document.body,
        )
      : null
  return { confetti, fire }
}
