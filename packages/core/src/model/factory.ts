/** New project: a blank design with the default catalog. */
import { furnitureCatalog } from './catalog.js';
import { names } from './names.js';
import { SCHEMA, SCHEMA_VERSION, type Project, type ProjectLanguage } from './schema.js';

export interface NewProjectOptions {
  id: string;
  name: string;
  /** Site width and depth (mm); defaults to 20 × 20 m */
  site?: { width: number; depth: number };
  location?: { lat: number; lon: number; tz: number };
  floors?: number;
  floorHeight?: number;
  /** Language of level and catalog names (and of names generated later); defaults to Chinese */
  language?: ProjectLanguage;
}

export function createProject(o: NewProjectOptions): Project {
  const { width, depth } = o.site ?? { width: 20000, depth: 20000 };
  const n = o.floors ?? 1,
    h = o.floorHeight ?? 3000;
  const language = o.language ?? 'zh',
    vocab = names(language);
  return {
    schema: SCHEMA,
    version: SCHEMA_VERSION,
    id: o.id,
    name: o.name,
    language,
    units: 'mm',
    site: {
      boundary: [
        [0, 0],
        [width, 0],
        [width, depth],
        [0, depth],
      ],
      northAngle: 0,
      location: o.location ?? { lat: 30, lon: 114, tz: 8 },
      groundLevel: -150,
    },
    levels: [
      ...Array.from({ length: n }, (_, i) => ({ id: `L${i + 1}`, name: vocab.level(i), elevation: i * h, height: h })),
      { id: 'RF', name: vocab.roof, elevation: n * h, height: 0, roof: true },
    ],
    walls: [],
    spaces: [],
    elements: [],
    furniture: [],
    constraints: [],
    brief: {},
    decisions: [],
    library: {
      furniture: furnitureCatalog(language),
      materials: {},
      elements: {},
    },
    variants: [],
  };
}
