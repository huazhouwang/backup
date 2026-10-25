/**
 * The plan's drawing, shared by the plan view and the 3D floors (so 3D grows out of exactly the plan): paper (the site boundary,
 * room floors in their material), ink (walls, furniture, doors and windows) and labels. The model seen from above through a
 * section cut, in greys like SketchUp's monochrome style: walls cut solid black, floors in their material's grey (see
 * floor-materials.tsx), furniture and fittings white with thin black edges. Coordinates in millimetres. Interaction (picking)
 * is optional.
 */
import type { AxesFrame, Point, Project } from '@plinth/core';
import { floorFill, FloorPatternDefs } from './floor-materials';
import { modelStyle } from '../model-style';
import { isGroundLevel, labelSize, type LevelShapes } from './plan-geometry';
import type { DimChain } from './dimensions';

const pts = (p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(' ');

/** A room's floor: its material (or white, as the model style says); a void is hatched */
const spaceFill = (p: Project, kind: string, material: string) =>
  kind === 'void' ? 'url(#hatch)' : modelStyle().floors === 'material' ? floorFill(p, material) : 'var(--card)';

/**
 * Stroke props for a line `width` screen pixels wide (dashes too). The plan keeps them that wide at any zoom (non-scaling strokes);
 * a 3D floor converts them to millimetres at the scale the plan is shown, so both draw the same line.
 */
export type Line = (width: number, dash?: number[]) => { strokeWidth: number; strokeDasharray?: string; vectorEffect?: 'non-scaling-stroke' };

export const screenLine: Line = (width, dash) => ({ strokeWidth: width, strokeDasharray: dash?.join(' '), vectorEffect: 'non-scaling-stroke' });
export const scaledLine =
  (mmPerPx: number): Line =>
  (width, dash) => ({ strokeWidth: width * mmPerPx, strokeDasharray: dash?.map(d => d * mmPerPx).join(' ') });

type Pick = (id: string) => (e: React.MouseEvent) => void;
const hit = (pick: Pick | undefined, id: string) => (pick ? { onClick: pick(id), className: 'plan-hit cursor-pointer', 'data-id': id } : {});

export function PlanDefs({ project }: { project: Project }) {
  return (
    <defs>
      <FloorPatternDefs project={project} />
      <pattern id="hatch" width="200" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="200" stroke="var(--muted-foreground)" strokeWidth="20" />
      </pattern>
      <pattern id="glassblock" width="100" height="100" patternUnits="userSpaceOnUse">
        <rect width="100" height="100" fill="var(--card)" stroke="var(--muted-foreground)" strokeWidth="12" />
      </pattern>
    </defs>
  );
}

/** The site boundary (on the lowest floor only: upper floors stand above it) and the room fills */
export function PlanPaper({ project, level, shapes, line, pick }: { project: Project; level: string; shapes: LevelShapes; line: Line; pick?: Pick }) {
  return (
    <>
      {isGroundLevel(project, level) && <polygon points={pts(project.site.boundary)} fill="none" stroke="var(--muted-foreground)" {...line(0.8, [6, 4])} />}
      {shapes.spaces.map(({ s, d }) => (
        <path key={s.id} d={d} fill={spaceFill(project, s.kind, s.floor)} {...hit(pick, s.id)} />
      ))}
    </>
  );
}

/** Stairs, ponds and drains: flights and water filled, treads and the walking line drawn; stairs seen from above faintly */
function PlanElements({ shapes, line, pick }: { shapes: LevelShapes; line: Line; pick?: Pick }) {
  return shapes.elements.map((e, i) => (
    <g key={`${e.id}-${i}`} opacity={e.faint ? 0.5 : undefined} {...(e.faint ? { pointerEvents: 'none' } : hit(pick, e.id))}>
      {e.fills.map((f, k) => (
        <polygon key={k} points={pts(f.ring)} fill={f.kind === 'water' ? 'var(--muted)' : 'var(--card)'} stroke="var(--foreground)" {...line(0.8)} />
      ))}
      {e.lines.map((l, k) => (
        <polyline key={k} points={pts(l.points)} fill="none" stroke="var(--foreground)" {...line(0.8, l.dashed ? [4, 3] : undefined)} />
      ))}
    </g>
  ));
}

/** Elements, walls, furniture, doors and windows; with `pick`, walls get hit areas above them */
export function PlanInk({ shapes, furniture, line, pick }: { shapes: LevelShapes; furniture: boolean; line: Line; pick?: Pick }) {
  return (
    <>
      <PlanElements shapes={shapes} line={line} pick={pick} />
      {furniture &&
        shapes.furniture.map(({ f, d, symbol }) =>
          symbol ? (
            // Its look seen from above, under a hit area the size of its footprint
            <g key={f.id}>
              {symbol.items.map((it, i) => (
                <path key={i} d={it.d} fill={it.fill ? 'var(--card)' : 'none'} stroke="var(--foreground)" {...line(0.5)} />
              ))}
              {symbol.lines && <path d={symbol.lines} fill="none" stroke="var(--foreground)" {...line(0.5)} />}
              <path d={d} fill="transparent" {...hit(pick, f.id)} />
            </g>
          ) : (
            <path key={f.id} d={d} fill="var(--card)" stroke="var(--foreground)" {...line(0.8)} {...hit(pick, f.id)} />
          ),
        )}
      {/* Walls cut by the section: solid black with a heavy outline; fences and parapets, lower than the cut, seen from above */}
      <g pointerEvents="none">
        <path d={shapes.light} fill="var(--card)" stroke="var(--foreground)" {...line(1)} />
        <path d={shapes.solid} fill="var(--foreground)" stroke="var(--foreground)" {...line(1.5)} />
        <path d={shapes.bearing} fill="var(--foreground)" stroke="var(--foreground)" {...line(1.5)} />
      </g>
      {shapes.railings.map(({ w, d }) => (
        <path key={w.id} d={d} fill="none" stroke="var(--foreground)" {...line(1.5)} pointerEvents="none" />
      ))}
      {pick && shapes.walls.map(({ w, d }) => <path key={w.id} d={d} fill="transparent" fillOpacity={0} {...hit(pick, w.id)} />)}
      {shapes.openings.map(o => (
        <g key={o.id} {...(pick ? { onClick: pick(o.id), className: 'cursor-pointer', 'data-id': o.id } : {})}>
          <polygon points={pts(o.outline)} className={pick ? 'plan-hit' : undefined} fill={o.glassBlock ? 'url(#glassblock)' : 'transparent'} />
          {o.lines.map((l, i) => (
            <polyline key={i} points={pts(l)} fill="none" stroke="var(--foreground)" {...line(1, o.dashed ? [6, 4] : undefined)} />
          ))}
          {o.arcs.map((a, i) => (
            <path key={i} d={a} fill="none" stroke="var(--muted-foreground)" {...line(1, [4, 3])} />
          ))}
        </g>
      ))}
    </>
  );
}

/** Room name and usable area; clicking a name also selects its room (hard to hit empty floor full of furniture, especially on phones) */
export function PlanLabels({ shapes, pick }: { shapes: LevelShapes; pick?: Pick }) {
  const font = labelSize(shapes.bounds);
  return (
    <>
      {shapes.spaces.map(({ s, label, area }) => (
        <g key={s.id} textAnchor="middle" fontFamily="var(--font-sans)" {...(pick ? { onClick: pick(s.id), className: 'cursor-pointer' } : {})}>
          <text
            x={label[0]}
            y={label[1]}
            fontSize={font}
            fill="var(--foreground)"
            fontWeight={500}
            paintOrder="stroke"
            stroke="var(--background)"
            strokeWidth={font / 6}
          >
            {s.name}
          </text>
          {/* The area, except for a void */}
          {s.kind !== 'void' && (
            <text
              x={label[0]}
              y={label[1] + font * 1.15}
              fontSize={font * 0.8}
              fill="var(--muted-foreground)"
              fontFamily="var(--font-mono)"
              paintOrder="stroke"
              stroke="var(--background)"
              strokeWidth={font / 6}
            >
              {area.toFixed(1)} m²
            </text>
          )}
        </g>
      ))}
    </>
  );
}

/**
 * Architectural dimensions (see dimensions.ts): a thin line, extension lines, 45° ticks at the marks and each segment's length in
 * millimetres beside the line; a value too long for its segment moves farther out, alternating, so neighbours don't collide
 */
export function PlanDimensions({ chains, size, line, color = 'var(--foreground)' }: { chains: DimChain[]; size: number; line: Line; color?: string }) {
  const tick = size * 0.45;
  return (
    <g pointerEvents="none" fontFamily="var(--font-mono)" fontSize={size} fill={color} textAnchor="middle">
      {chains.map((c, k) => {
        const at = (t: number, off = 0): [number, number] => [c.origin[0] + c.dir[0] * t + c.normal[0] * off, c.origin[1] + c.dir[1] * t + c.normal[1] * off];
        const a = at(c.marks[0]),
          b = at(c.marks[c.marks.length - 1]);
        // Values read left to right, or bottom to top
        const flip = c.dir[0] < -1e-6 || (Math.abs(c.dir[0]) < 1e-6 && c.dir[1] > 0);
        const angle = (Math.atan2(c.dir[1], c.dir[0]) * 180) / Math.PI + (flip ? 180 : 0);
        // The text's up direction on the page; values sit on the normal side
        const up: [number, number] = flip ? [-c.dir[1], c.dir[0]] : [c.dir[1], -c.dir[0]];
        const above = up[0] * c.normal[0] + up[1] * c.normal[1] > 0;
        let out = 0;
        return (
          <g key={k}>
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} {...line(0.6)} />
            {c.marks.map((t, i) => {
              const [x, y] = at(t);
              const [ex, ey] = at(t, -c.ext);
              const [fx, fy] = at(t, tick);
              // A 45° tick: across the line, turned an eighth
              const d: [number, number] = [(c.dir[0] + c.normal[0]) * tick * 0.7, (c.dir[1] + c.normal[1]) * tick * 0.7];
              return (
                <g key={i}>
                  <line x1={ex} y1={ey} x2={fx} y2={fy} stroke={color} {...line(0.6)} />
                  <line x1={x - d[0]} y1={y - d[1]} x2={x + d[0]} y2={y + d[1]} stroke={color} {...line(1.4)} />
                </g>
              );
            })}
            {c.marks.slice(1).map((t, i) => {
              const len = t - c.marks[i];
              const text = String(Math.round(len));
              // Too long for its segment: alternate farther out
              const fits = len > text.length * size * 0.62 + size * 0.4;
              out = fits ? 0 : out === 1 ? 2 : 1;
              const [x, y] = at((t + c.marks[i]) / 2, size * (0.35 + out * 1.05));
              return (
                <text
                  key={i}
                  x={x}
                  y={y}
                  transform={`rotate(${angle} ${x} ${y})`}
                  dominantBaseline={above ? 'alphabetic' : 'hanging'}
                  paintOrder="stroke"
                  stroke="var(--canvas-backdrop)"
                  strokeWidth={size / 5}
                >
                  {text}
                </text>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/**
 * The model axes on the plan, as SketchUp's top view: red along x, green along y, through the origin across the drawing's frame;
 * solid on the positive side, dashed on the negative
 */
/** The part of the line through `at` along `dir` inside a rectangle [x, y, w, h], as a range of t; null when it misses */
export function lineRange(at: Point, dir: Point, [x, y, w, h]: [number, number, number, number]): [number, number] | null {
  let t0 = -Infinity,
    t1 = Infinity;
  for (const [o, d, lo, hi] of [
    [at[0], dir[0], x, x + w],
    [at[1], dir[1], y, y + h],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const a = (lo - o) / d,
      b = (hi - o) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/**
 * The model axes on the plan, as SketchUp draws them: red and green through the origin, solid on the positive side with an arrow at
 * its end, dashed on the negative. Moved or turned (see Axes in the core schema), the world axes stay as faint dashes and the model
 * axes carry a tick every metre and a label every five. `px` is a screen pixel in mm.
 */
export function PlanAxes({ frame, axes, line, px }: { frame: { x: number; y: number; w: number; h: number }; axes: AxesFrame; line: Line; px: number }) {
  const rect: [number, number, number, number] = [frame.x, frame.y, frame.w, frame.h];
  const custom = axes.angle % 360 !== 0 || axes.origin[0] !== 0 || axes.origin[1] !== 0;
  const at = (o: Point, d: Point, t: number): Point => [o[0] + d[0] * t, o[1] + d[1] * t];
  const seg = (k: string, color: string, a: Point, b: Point, dash?: number[], opacity?: number) => (
    <line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} opacity={opacity} {...line(1, dash)} />
  );
  const axis = (k: string, color: string, o: Point, d: Point, faint: boolean) => {
    const r = lineRange(o, d, rect);
    if (!r) return null;
    const [t0, t1] = r;
    if (faint) return seg(k, color, at(o, d, t0), at(o, d, t1), [4, 4], 0.35);
    const n: Point = [-d[1], d[0]];
    const out = [];
    if (t1 > 0) {
      const tip = at(o, d, t1);
      const s = 9 * px;
      out.push(
        seg(`${k}+`, color, at(o, d, Math.max(0, t0)), at(tip, d, -s)),
        <polygon
          key={`${k}>`}
          points={[tip, at(at(tip, d, -s * 1.6), n, s * 0.55), at(at(tip, d, -s * 1.6), n, -s * 0.55)].map(q => q.join(',')).join(' ')}
          fill={color}
        />,
      );
    }
    if (t0 < 0) out.push(seg(`${k}-`, color, at(o, d, t0), at(o, d, Math.min(0, t1)), [6, 4]));
    if (custom)
      for (let m = Math.ceil(t0 / 1000); m <= Math.floor(t1 / 1000); m++) {
        if (!m) continue;
        const q = at(o, d, m * 1000);
        const long = m % 5 === 0;
        const h = (long ? 6 : 3) * px;
        out.push(seg(`${k}t${m}`, color, at(q, n, -h), at(q, n, h)));
        if (long)
          out.push(
            <text
              key={`${k}l${m}`}
              x={at(q, n, 14 * px)[0]}
              y={at(q, n, 14 * px)[1]}
              fontSize={10 * px}
              fill={color}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="var(--font-mono)"
            >
              {m}
            </text>,
          );
      }
    return <g key={k}>{out}</g>;
  };
  return (
    <g pointerEvents="none" data-axes={custom ? `${axes.origin.join(',')}@${axes.angle}` : 'world'}>
      {custom && [axis('wx', 'var(--axis-x)', [0, 0], [1, 0], true), axis('wy', 'var(--axis-y)', [0, 0], [0, 1], true)]}
      {axis('x', 'var(--axis-x)', axes.origin, axes.x, false)}
      {axis('y', 'var(--axis-y)', axes.origin, axes.y, false)}
    </g>
  );
}

/** Round lengths for the scale bar (metres) */
const SCALE_LENGTHS = [0.5, 1, 2, 5, 10, 20];

/**
 * The drawing's scale bar, in the frame's bottom-left corner: a round length in metres in alternating blocks, sized like the
 * dimensions. (North is on the compass over the canvas.)
 */
export function PlanMarks({ frame, size, line }: { frame: { x: number; y: number; w: number; h: number; pad: number }; size: number; line: Line }) {
  const c = frame.pad / 2;
  // The bar: the longest round length that fits the corner
  const room = (frame.pad * 0.8) / 1000;
  const length = [...SCALE_LENGTHS].reverse().find(l => l <= room) ?? SCALE_LENGTHS[0];
  const parts = length <= 2 ? length * 2 : 5;
  const bw = (length * 1000) / parts,
    bh = size * 0.4;
  const [bx, by] = [frame.x + c - (length * 1000) / 2, frame.y + frame.h - c];
  return (
    <g pointerEvents="none" fontFamily="var(--font-mono)" fontSize={size} fill="var(--foreground)">
      {Array.from({ length: parts }, (_, i) => (
        <rect
          key={i}
          x={bx + i * bw}
          y={by - bh / 2}
          width={bw}
          height={bh}
          fill={i % 2 ? 'var(--background)' : 'var(--foreground)'}
          stroke="var(--foreground)"
          {...line(0.8)}
        />
      ))}
      <text x={bx} y={by - bh / 2 - size * 0.3} textAnchor="middle">
        0
      </text>
      <text x={bx + length * 1000} y={by - bh / 2 - size * 0.3} textAnchor="middle">
        {`${length} m`}
      </text>
    </g>
  );
}
