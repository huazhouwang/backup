/**
 * The mask pass (issue 195): every surface drawn in the flat colour of what it is, in the ADE20K segmentation palette that
 * segmentation-conditioned image models (ControlNet seg and the like) were trained on. Colours here are a data convention, not
 * the theme: a model reads [120, 120, 120] as "wall".
 */
export const MASK_CLASSES = ['wall', 'building', 'sky', 'floor', 'ceiling', 'window', 'door', 'earth', 'furniture', 'stairs', 'railing'] as const;
export type MaskClass = (typeof MASK_CLASSES)[number];

/** ADE20K colours (RGB 0–255): wall, building, sky, floor, ceiling, windowpane, door, earth, cabinet, stairs, railing */
export const MASK_COLORS: Record<MaskClass, [number, number, number]> = {
  wall: [120, 120, 120],
  building: [180, 120, 120],
  sky: [6, 230, 230],
  floor: [80, 50, 50],
  ceiling: [120, 120, 80],
  window: [230, 230, 230],
  door: [8, 255, 51],
  earth: [120, 120, 70],
  furniture: [224, 5, 255],
  stairs: [255, 224, 0],
  railing: [255, 61, 6],
};

/** What a part of the building is in a shot: seen from outside, walls and roofs are all "building" */
export function maskClass(part: 'wall' | 'floor' | 'roof' | 'window' | 'door' | 'furniture' | 'stairs' | 'railing' | 'element', inside: boolean): MaskClass {
  switch (part) {
    case 'wall':
      return inside ? 'wall' : 'building';
    case 'roof':
      return inside ? 'ceiling' : 'building';
    case 'element':
      return inside ? 'wall' : 'building';
    default:
      return part;
  }
}
