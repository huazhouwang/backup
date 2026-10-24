/**
 * Materials drawn as patterns: wood planks, tiles, bricks, terrazzo, gravel… made from a material's procedural texture (its
 * glTF `extras`: pattern, size, colours; see packages/core/src/looks/material.ts), used by the plan (an SVG pattern fill) and by the
 * 3D floors (the same tile rasterized as a texture). The plan draws them in greys, like SketchUp's monochrome style; 3D in their
 * colours. Sizes in millimetres; colours from the material (library data, not the theme).
 */
import { materialOf, type Material, type Project } from '@plinth/core';
import type { ReactElement } from 'react';
import { cssColor, grayColor } from '@/lib/materials';

export interface FloorPattern {
  /** Size of one repeat */
  w: number;
  h: number;
  /** The repeat's content, drawn in a w × h box */
  tile: ReactElement;
}

/** A pseudo-random sequence, so speckles land in the same places every time */
function* scatter(seed: number) {
  let s = seed;
  for (;;) {
    s = (s * 16807) % 2147483647;
    yield (s - 1) / 2147483646;
  }
}

const SEAM = 10;

/** Boards in a running bond: rows `width` wide, boards `length` long, every other row shifted half a board */
function planks(base: string, seam: string, width: number, length: number): FloorPattern {
  return {
    w: length,
    h: width * 2,
    tile: (
      <>
        <rect width={length} height={width * 2} fill={base} />
        <rect y={width} width={length} height={width} fill={seam} fillOpacity={0.18} />
        <path d={`M0 0H${length}M0 ${width}H${length}M0 0V${width}M${length / 2} ${width}V${width * 2}`} stroke={seam} strokeWidth={SEAM} />
      </>
    ),
  };
}

/** Square tiles with grout lines */
function tiles(base: string, grout: string, size: number): FloorPattern {
  return {
    w: size,
    h: size,
    tile: (
      <>
        <rect width={size} height={size} fill={base} />
        <path d={`M0 0H${size}M0 0V${size}`} stroke={grout} strokeWidth={SEAM * 1.5} />
      </>
    ),
  };
}

/** Bricks in a running bond, `w` × `h` each */
function bricks(base: string, joint: string, w: number, h: number): FloorPattern {
  return {
    w: w,
    h: h * 2,
    tile: (
      <>
        <rect width={w} height={h * 2} fill={base} />
        <path d={`M0 0H${w}M0 ${h}H${w}M0 0V${h}M${w / 2} ${h}V${h * 2}`} stroke={joint} strokeWidth={SEAM} />
      </>
    ),
  };
}

/** A plain surface with speckles (terrazzo chips, gravel stones, cement mottling) */
function speckled(base: string, dots: string[], size: number, count: number, radius: [number, number], seed: number): FloorPattern {
  const r = scatter(seed);
  const next = () => r.next().value as number;
  return {
    w: size,
    h: size,
    tile: (
      <>
        <rect width={size} height={size} fill={base} />
        {Array.from({ length: count }, (_, i) => (
          <circle key={i} cx={next() * size} cy={next() * size} r={radius[0] + next() * (radius[1] - radius[0])} fill={dots[i % dots.length]} />
        ))}
      </>
    ),
  };
}

/** Large stone tiles with a few soft veins */
function marble(base: string, vein: string, grout: string, size: number, seed: number): FloorPattern {
  const r = scatter(seed);
  const next = () => r.next().value as number;
  const veins = Array.from({ length: 3 }, () => {
    const y0 = next() * size,
      y1 = next() * size;
    return `M0 ${y0}C${size / 3} ${y0 + ((next() - 0.5) * size) / 2} ${(2 * size) / 3} ${y1 + ((next() - 0.5) * size) / 2} ${size} ${y1}`;
  });
  return {
    w: size,
    h: size,
    tile: (
      <>
        <rect width={size} height={size} fill={base} />
        {veins.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={vein} strokeWidth={6 + i * 4} />
        ))}
        <path d={`M0 0H${size}M0 0V${size}`} stroke={grout} strokeWidth={SEAM / 2} />
      </>
    ),
  };
}

/** A material's pattern, from its procedural texture, in its colours or in greys (the plan); null for a plain material */
export function materialPattern(m: Material | undefined, gray = false): FloorPattern | null {
  const x = m?.extras;
  if (!m || !x?.pattern) return null;
  const color = gray ? grayColor : cssColor;
  const base = color(m.pbrMetallicRoughness.baseColorFactor),
    c2 = x.color2 ? color(x.color2) : base,
    c3 = x.color3 ? color(x.color3) : c2;
  const [a, b] = Array.isArray(x.size) ? x.size : [x.size ?? 600, x.size ?? 600];
  switch (x.pattern) {
    case 'planks':
      return planks(base, c2, a, b);
    case 'tiles':
      return tiles(base, c2, a);
    case 'bricks':
      return bricks(base, c2, a, b);
    case 'speckled':
      return speckled(base, x.color3 ? [c2, c3] : [c2], a, x.count ?? 100, x.radius ?? [a / 100, a / 40], x.seed ?? 1);
    case 'marble':
      return marble(base, c2, c3, a, x.seed ?? 1);
  }
}

/** The plan's fill for a floor material, in greys: its pattern, its tone, or plain white for a material that doesn't exist */
export function floorFill(p: Project, material: string) {
  const m = materialOf(material, null, p.library.materials);
  return !m ? 'var(--card)' : materialPattern(m) ? `url(#floor-${material})` : grayColor(m.pbrMetallicRoughness.baseColorFactor);
}

/** Pattern definitions for the floor materials a design uses, in greys, inside the plan's <defs> */
export function FloorPatternDefs({ project }: { project: Project }) {
  const used = [...new Set(project.spaces.map(s => s.floor))];
  return (
    <>
      {used.map(k => {
        const p = materialPattern(materialOf(k, null, project.library.materials), true);
        return (
          p && (
            <pattern key={k} id={`floor-${k}`} width={p.w} height={p.h} patternUnits="userSpaceOnUse">
              {p.tile}
            </pattern>
          )
        );
      })}
    </>
  );
}
