/**
 * Round gridline steps for the charts. Two ways, as the charts need: the growth chart wants
 * about five steps over a measured span, the trends charts about three over a count or an
 * amount in the metric's own unit.
 */

/** A step of 1, 2 or 5 × a power of ten giving about five gridlines over `span`. */
export function niceStep(span: number): number {
  const raw = span / 5
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  return (unit < 1.5 ? 1 : unit < 3 ? 2 : unit < 7 ? 5 : 10) * power
}

/** Upper bound and step for about three gridlines on round values of `unit`, from zero. */
export function niceScale(max: number, unit: number): { top: number; step: number } {
  const units = Math.max(1, Math.ceil(max / unit))
  const raw = units / 3
  const power = 10 ** Math.floor(Math.log10(raw))
  const nice = [1, 2, 5, 10].find((n) => n * power >= raw) ?? 10
  const step = nice * power * unit
  return { top: Math.max(step, Math.ceil(max / step) * step), step }
}

/** The gridline values from `from` to `to`, `step` apart. */
export const ticks = (from: number, to: number, step: number) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step)
