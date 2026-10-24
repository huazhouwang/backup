/**
 * Model style: how the plan and the 3D model look (edges, sky, floors), apart from the website's theme. The default style lives
 * here in code and is never written to the project file: a project that hasn't chosen another style stores nothing, and follows
 * the default as it improves. Colors stay theme variables (light.css); a style only picks which ones apply.
 */
export interface ModelStyle {
  /** SketchUp-like black edges and profiles in 3D */
  edges: boolean;
  /** A sky gradient behind the 3D model instead of the plain backdrop */
  sky: boolean;
  /** Floors drawn with their material (wood, tiles…) or plain white */
  floors: 'material' | 'white';
  /** Walls drawn in their finish (white paint unless chosen otherwise) or plain white */
  walls: 'finish' | 'white';
}

/** The default ("general") style: walls in their finish (white paint by default), floors in their material, clear glass, soft shadows, a blue sky */
export const DEFAULT_STYLE: ModelStyle = { edges: false, sky: true, floors: 'material', walls: 'finish' };

/** The style a project is shown in (projects can't choose another one yet) */
export const modelStyle = (): ModelStyle => DEFAULT_STYLE;
