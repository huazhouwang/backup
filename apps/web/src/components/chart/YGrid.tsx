/** Horizontal gridlines across an SVG chart, each labelled at its left. */
export function YGrid({
  values,
  y,
  left,
  right,
  label,
}: {
  values: readonly number[]
  /** Where a value sits, in the chart's viewBox units. */
  y: (value: number) => number
  /** The plot's left and right edges; labels end just left of it. */
  left: number
  right: number
  label: (value: number) => string
}) {
  return values.map((value) => (
    <g key={value}>
      <line
        x1={left}
        x2={right}
        y1={y(value)}
        y2={y(value)}
        className="stroke-border"
        strokeWidth={1}
      />
      <text
        x={left - 6}
        y={y(value)}
        textAnchor="end"
        dominantBaseline="middle"
        className="fill-muted-foreground text-[10px] tabular-nums"
      >
        {label(value)}
      </text>
    </g>
  ))
}
