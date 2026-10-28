import { useEffect, useRef } from 'react'

/**
 * Rings rippling out from the microphone while it listens, one after another; the louder the
 * voice, the further and stronger they go. With reduced motion, one still ring follows it.
 */
export function Waves({ analyser }: { analyser: AnalyserNode | null }) {
  const reach = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!analyser) return undefined
    const samples = new Uint8Array(analyser.fftSize)
    let level = 0
    let frame = 0
    const draw = () => {
      analyser.getByteTimeDomainData(samples)
      let peak = 0
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128)
      // Eased, so the rings swell and settle rather than flicker.
      level += (Math.min(1, peak * 3) - level) * 0.2
      if (reach.current) {
        reach.current.style.scale = String(0.75 + level * 0.6)
        reach.current.style.opacity = String(0.5 + level * 0.5)
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [analyser])
  return (
    <span ref={reach} aria-hidden className="pointer-events-none absolute inset-0">
      {[0, 700, 1400].map((delay) => (
        <span
          key={delay}
          className="absolute inset-0 animate-ripple rounded-full border-[3px] border-primary bg-primary/15 motion-reduce:hidden"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
      <span className="absolute -inset-5 hidden rounded-full bg-primary/30 motion-reduce:block" />
    </span>
  )
}
