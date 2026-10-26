import { useEffect, useRef, useState } from 'react'

import { prefersReducedMotion } from '../../lib/motion'

/** The app's record colours, flat, as the paper pieces. */
const COLORS = [
  'var(--color-primary)',
  'var(--color-feeding)',
  'var(--color-sleep)',
  'var(--color-diaper)',
  'var(--color-pumping)',
]
const PIECES = 56
/** Pull down (px/s²), and the fastest paper falls (px/s): it flutters rather than drops. */
const GRAVITY = 2200
const FALLING = 520
/** Each frame keeps this much of the sideways speed: air slows it. */
const DRAG = 0.96
const FRAME_S = 1 / 60
const LONGEST_S = 2.6

interface Piece {
  id: string
  /** Where it starts on the screen (px). */
  x: number
  y: number
  size: number
  round: boolean
  color: string
  flight: Keyframe[]
  timing: KeyframeAnimationOptions
}

/**
 * One piece's path: shot up and out from `depth` px behind the box's top edge, clear of it,
 * then fluttering down in front of the box until it is off the screen.
 */
function flight(fromY: number, depth: number, belowScreen: number, spin: number): Keyframe[] {
  const height = depth + 60 + Math.random() * 200
  let vy = -Math.sqrt(2 * GRAVITY * height)
  let vx = (Math.random() - 0.5) * 900
  const wobble = Math.random() * Math.PI * 2
  let x = 0
  let y = 0
  // Behind the box (z-10) on the way up, in front of it on the way down.
  const frames: Keyframe[] = [{ translate: '0 0', rotate: '0deg', scale: 0.4, zIndex: 0 }]
  for (let frame = 1; frame * FRAME_S <= LONGEST_S; frame++) {
    vy = Math.min(vy + GRAVITY * FRAME_S, FALLING)
    vx *= DRAG
    x += vx * FRAME_S
    y += vy * FRAME_S
    // A frame in four is enough for the browser to draw the curve between.
    if (frame % 4 !== 0) continue
    const t = frame * FRAME_S
    // Falling paper sways side to side.
    const sway = vy > 0 ? Math.sin(t * 9 + wobble) * 14 : 0
    frames.push({
      translate: `${x + sway}px ${y}px`,
      rotate: `${spin * t}deg`,
      scale: 1,
      zIndex: vy > 0 ? 20 : 0,
    })
    if (fromY + y > belowScreen) break
  }
  return frames
}

function newPieces(burst: number, box: DOMRect): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => {
    // From anywhere behind the box, mostly its top half.
    const x = box.left + Math.random() * box.width
    const depth = Math.random() * Math.min(box.height, 160)
    const y = box.top + depth
    const path = flight(y, depth, window.innerHeight + 20, (Math.random() - 0.5) * 900)
    return {
      id: `${burst}-${i}`,
      x,
      y,
      size: 8 + Math.random() * 6,
      round: i % 3 === 0,
      color: COLORS[i % COLORS.length] ?? 'var(--color-primary)',
      flight: path,
      timing: {
        duration: (path.length - 1) * 4 * FRAME_S * 1000,
        delay: Math.random() * 120,
        fill: 'both',
      },
    }
  })
}

/** One piece, flying once: a page that renders again doesn't send it off again. */
function ConfettiPiece({ piece }: { piece: Piece }) {
  const node = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const flying = node.current?.animate(piece.flight, piece.timing)
    return () => flying?.cancel()
  }, [piece])
  return (
    <span
      ref={node}
      className="absolute"
      style={{
        left: piece.x,
        top: piece.y,
        width: piece.size,
        height: piece.round ? piece.size : piece.size * 0.6,
        borderRadius: piece.round ? 999 : 2,
        background: piece.color,
      }}
    />
  )
}

/** The screen, from the box's top left, when the pieces were fired. */
interface Screen {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Flat paper pieces bursting up from behind a box and fluttering down in front of it, once,
 * for something worth celebrating. Put the box (`relative z-10`, which the pieces go behind
 * and then in front of) and `confetti` together in a `relative` wrapper; `fire(box)` sets
 * them off. Skipped with reduced motion.
 */
export function useConfetti() {
  const [pieces, setPieces] = useState<Piece[]>([])
  const [screen, setScreen] = useState<Screen | null>(null)
  const fire = (box: Element | null) => {
    if (!box || prefersReducedMotion()) return
    const burst = Date.now()
    const rect = box.getBoundingClientRect()
    setScreen({
      left: -rect.left,
      top: -rect.top,
      width: window.innerWidth,
      height: window.innerHeight,
    })
    setPieces(newPieces(burst, rect))
    setTimeout(
      () => setPieces((current) => (current[0]?.id.startsWith(`${burst}-`) ? [] : current)),
      LONGEST_S * 1000 + 200,
    )
  }
  const confetti =
    pieces.length > 0 && screen ? (
      // In the page rather than over it, so pieces can pass behind the box. It covers the
      // screen as it was and clips there, so pieces flying out never widen or lengthen the
      // page.
      <div
        aria-hidden
        data-confetti
        className="pointer-events-none absolute overflow-clip"
        style={screen}
      >
        {pieces.map((piece) => (
          <ConfettiPiece key={piece.id} piece={piece} />
        ))}
      </div>
    ) : null
  return { confetti, fire }
}
