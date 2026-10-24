/**
 * The plan's drawing, shared by the plan view and the 3D floors (so 3D grows out of exactly the plan): paper (the site boundary,
 * room floors in their material), ink (walls, furniture, doors and windows) and labels. The model seen from above through a
 * section cut, in greys like SketchUp's monochrome style: walls cut solid black, floors in their material's grey (see
 * floor-materials.tsx), furniture and fittings white with thin black edges. Coordinates in millimetres. Interaction (picking)
 * is optional.
 */
import type { Project } from '@plinth/core';
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
export function PlanDimensions({ chains, size, line }: { chains: DimChain[]; size: number; line: Line }) {
  const tick = size * 0.45;
  return (
    <g pointerEvents="none" fontFamily="var(--font-mono)" fontSize={size} fill="var(--foreground)" textAnchor="middle">
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
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--foreground)" {...line(0.6)} />
            {c.marks.map((t, i) => {
              const [x, y] = at(t);
              const [ex, ey] = at(t, -c.ext);
              const [fx, fy] = at(t, tick);
              // A 45° tick: across the line, turned an eighth
              const d: [number, number] = [(c.dir[0] + c.normal[0]) * tick * 0.7, (c.dir[1] + c.normal[1]) * tick * 0.7];
              return (
                <g key={i}>
                  <line x1={ex} y1={ey} x2={fx} y2={fy} stroke="var(--foreground)" {...line(0.6)} />
                  <line x1={x - d[0]} y1={y - d[1]} x2={x + d[0]} y2={y + d[1]} stroke="var(--foreground)" {...line(1.4)} />
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
