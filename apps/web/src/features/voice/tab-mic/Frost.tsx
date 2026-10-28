/**
 * Frosted glass that is thickest at the microphone and thins out towards the top, so the
 * page above ends in itself (and the status bar) with no edge. A backdrop blur can't vary
 * across an element, so blurs of growing strength are stacked, each over less of the screen.
 * Layers are [blur px, fully on below this %, gone above this %], measured from the bottom.
 */
const FROST = [
  [2, 50, 100],
  [5, 40, 85],
  [10, 25, 70],
  [20, 0, 50],
] as const

export function Frost() {
  return (
    <>
      {FROST.map(([blur, from, to]) => (
        <div
          key={blur}
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
            maskImage: `linear-gradient(to top, black ${from}%, transparent ${to}%)`,
          }}
        />
      ))}
      {/* The page's own colour over it, the same way: nearly solid at the bottom, none on top. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_top,color-mix(in_oklab,var(--color-background)_97%,transparent),color-mix(in_oklab,var(--color-background)_92%,transparent)_40%,color-mix(in_oklab,var(--color-background)_60%,transparent)_62%,color-mix(in_oklab,var(--color-background)_15%,transparent)_85%,transparent)]"
      />
    </>
  )
}
