/**
 * The room program a house is generated from (issue 187): what the interview (#186) learns, as data. Areas are in m², lengths in mm.
 * `normalizeProgram` fills in what the brief leaves open, so "you decide" on every question still gives a complete house.
 */
import type { ProjectLanguage } from '../model/schema.js';

export const ROOM_TYPES = [
  'living',
  'dining',
  'kitchen',
  'master',
  'bedroom',
  'elder',
  'kids',
  'study',
  'bath',
  'storage',
  'laundry',
  'shrine',
  'tea',
  'family',
  'garage',
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export interface ProgramRoom {
  type: RoomType;
  /** Name written into the design; defaults to the type's name in the project language (numbered when repeated) */
  name?: string;
  /** Target net area (m²) */
  area?: number;
  /** Storey, 0 = ground floor; chosen by the generator when absent */
  floor?: number;
}

export interface HouseProgram {
  /** Storeys above ground, 1–3 */
  floors: number;
  rooms: ProgramRoom[];
  /** The buildable area on the plot (mm): the house must fit inside it. Absent: no limit. */
  plot?: { width: number; depth: number };
  /** Storey height (mm), default 3000 */
  storeyHeight?: number;
}

/** A room once the program is complete: every field decided */
export interface PlannedRoom {
  type: RoomType;
  name: string;
  area: number;
  floor: number;
}

export interface Program {
  floors: number;
  rooms: PlannedRoom[];
  plot?: { width: number; depth: number };
  storeyHeight: number;
}

/** Typical net areas (m²) for a family house; what "you decide" means */
export const DEFAULT_AREA: Record<RoomType, number> = {
  living: 26,
  dining: 12,
  kitchen: 9,
  master: 16,
  bedroom: 12,
  elder: 14,
  kids: 11,
  study: 9,
  bath: 5,
  storage: 5,
  laundry: 4,
  shrine: 8,
  tea: 10,
  family: 14,
  garage: 22,
};

/** Smallest sensible net area (m²): a request below it is raised to it */
const MIN_AREA: Partial<Record<RoomType, number>> = { living: 14, master: 11, bedroom: 8, elder: 9, kids: 7, kitchen: 5, bath: 3.2, garage: 16 };

/** Rooms that want the sunny side, and that sleep */
export const SUNNY: ReadonlySet<RoomType> = new Set(['living', 'master', 'bedroom', 'elder', 'kids', 'study', 'tea', 'family', 'shrine']);
export const SLEEPING: ReadonlySet<RoomType> = new Set(['master', 'bedroom', 'elder', 'kids']);
/** Rooms that stay on the ground floor whatever the storey count */
const GROUND: ReadonlySet<RoomType> = new Set(['living', 'dining', 'kitchen', 'garage', 'elder', 'shrine', 'tea']);

const NAMES: Record<ProjectLanguage, Record<RoomType, string>> = {
  zh: {
    living: '客厅',
    dining: '餐厅',
    kitchen: '厨房',
    master: '主卧',
    bedroom: '卧室',
    elder: '老人房',
    kids: '儿童房',
    study: '书房',
    bath: '卫生间',
    storage: '储物间',
    laundry: '洗衣房',
    shrine: '神位',
    tea: '茶室',
    family: '起居室',
    garage: '车库',
  },
  en: {
    living: 'Living room',
    dining: 'Dining room',
    kitchen: 'Kitchen',
    master: 'Main bedroom',
    bedroom: 'Bedroom',
    elder: "Elders' room",
    kids: "Children's room",
    study: 'Study',
    bath: 'Bathroom',
    storage: 'Storage',
    laundry: 'Laundry',
    shrine: 'Shrine',
    tea: 'Tea room',
    family: 'Family room',
    garage: 'Garage',
  },
};

/** Names of the spaces the generator adds itself */
export const EXTRA_NAMES: Record<ProjectLanguage, { corridor: string; stair: string; veranda: string; courtyard: string; terrace: string }> = {
  zh: { corridor: '过道', stair: '楼梯间', veranda: '檐廊', courtyard: '庭院', terrace: '露台' },
  en: { corridor: 'Hallway', stair: 'Stairwell', veranda: 'Veranda', courtyard: 'Courtyard', terrace: 'Terrace' },
};

export const roomTypeName = (type: RoomType, language: ProjectLanguage) => NAMES[language][type];

const ZH_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * Completes a program: default areas, a bathroom on every storey with bedrooms (and one on the ground floor), storeys for
 * rooms that have none (living spaces down, bedrooms up when there is an upper floor), and unique names.
 */
export function normalizeProgram(input: HouseProgram, language: ProjectLanguage): Program {
  const floors = Math.max(1, Math.min(3, Math.round(input.floors || 1)));
  const rooms = input.rooms.filter(r => (ROOM_TYPES as readonly string[]).includes(r.type)).map(r => ({ ...r }));
  if (!rooms.some(r => r.type === 'living')) rooms.unshift({ type: 'living' });
  if (!rooms.some(r => r.type === 'kitchen')) rooms.push({ type: 'kitchen' });
  if (!rooms.some(r => SLEEPING.has(r.type))) rooms.push({ type: 'master' });

  // Storeys: fixed ones as asked; ground-floor rooms down; sleeping rooms spread over the upper floors, the rest stays down
  const upper = floors - 1;
  let next = 0;
  for (const r of rooms) {
    if (r.floor !== undefined) r.floor = Math.max(0, Math.min(floors - 1, Math.round(r.floor)));
    else if (upper === 0 || GROUND.has(r.type)) r.floor = 0;
    else if (SLEEPING.has(r.type) || r.type === 'study' || r.type === 'family') r.floor = 1 + (next++ % upper);
    else r.floor = 0;
  }
  // A bathroom on the ground floor and on every storey with a bedroom
  for (let f = 0; f < floors; f++) {
    const here = rooms.filter(r => r.floor === f);
    const needs = f === 0 || here.some(r => SLEEPING.has(r.type));
    if (needs && !here.some(r => r.type === 'bath')) rooms.push({ type: 'bath', floor: f });
  }
  // Two or more storeys and nothing upstairs but a bathroom: move a bedroom up
  for (let f = 1; f < floors; f++) {
    if (rooms.some(r => r.floor === f && r.type !== 'bath')) continue;
    const r = rooms.find(x => x.floor === 0 && SLEEPING.has(x.type) && x.type !== 'elder') ?? rooms.find(x => x.floor === 0 && SLEEPING.has(x.type));
    if (r) r.floor = f;
    else rooms.push({ type: 'bedroom', floor: f });
  }

  const count = new Map<string, number>();
  const total = new Map<string, number>();
  const base = (r: ProgramRoom) => r.name?.trim() || roomTypeName(r.type, language);
  for (const r of rooms) total.set(base(r), (total.get(base(r)) ?? 0) + 1);
  const planned: PlannedRoom[] = rooms.map(r => {
    const b = base(r);
    const n = (count.get(b) ?? 0) + 1;
    count.set(b, n);
    // Repeated names are numbered: 卧室一, 卧室二 / Bedroom 1, Bedroom 2
    const name = total.get(b)! > 1 && !r.name ? (language === 'zh' ? `${b}${ZH_NUMBERS[n - 1] ?? n}` : `${b} ${n}`) : b;
    const area = Math.max(MIN_AREA[r.type] ?? 2.5, r.area && r.area > 0 ? r.area : DEFAULT_AREA[r.type]);
    return { type: r.type, name, area, floor: r.floor! };
  });
  return {
    floors,
    rooms: planned,
    ...(input.plot ? { plot: input.plot } : {}),
    storeyHeight: input.storeyHeight && input.storeyHeight >= 2600 ? input.storeyHeight : 3000,
  };
}
