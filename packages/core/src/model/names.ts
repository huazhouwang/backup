/**
 * Names written into project data (levels, walls, openings, furniture) follow the project's language
 * (`Project.language`), not the UI language: a Chinese project keeps “客厅北墙” even when the app runs in English.
 * This file holds that per-language vocabulary; user-facing UI text goes through i18n.ts instead.
 */
import type { OpeningKind, Project, ProjectLanguage, WallKind } from './schema.js';

export type Direction = 'north' | 'south' | 'east' | 'west';

/** Separator between a level (or wall) name and an object name, e.g. “二层·主卧”, “Level 2·Bedroom” */
export const NAME_SEPARATOR = '·';
/** Separators accepted when parsing references typed by people or the agent */
export const REF_SEPARATOR = /^(.+?)[·:：](.+)$/;

export interface Vocabulary {
  /** Name of the n-th storey (0-based) */
  level(i: number): string;
  roof: string;
  direction: Record<Direction, string>;
  /** Word for a wall of this kind: 墙 / 围墙 …, wall / fence … */
  wall: Record<WallKind, string>;
  opening: Record<OpeningKind, string>;
  /** Opening word with glass-block glazing: 玻璃砖窗 / Glass-block window */
  glassBlock(word: string): string;
  /** Wall named after a space and the direction it lies in: 客厅北墙 / Living room north wall */
  spaceWall(space: string, dir: Direction | null, kindWord: string): string;
  /** Exterior wall shared by several rooms on one side: 北外墙 / North exterior wall */
  exteriorWall(dir: Direction | null): string;
  /** Wall with no space next to it, named after the level (ID) */
  levelWall(level: string, kindWord: string): string;
  /** Wall with no space next to it, named after its orientation (legacy import) */
  axisWall(horizontal: boolean, kindWord: string): string;
  /** Duplicate numbering within a level: 客厅北墙（2） / Living room north wall (2) */
  numbered(base: string, n: number): string;
}

const ZH_LEVELS = ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层', '十层'];
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const VOCABULARY: Record<ProjectLanguage, Vocabulary> = {
  zh: {
    level: i => ZH_LEVELS[i] ?? `${i + 1}层`,
    roof: '屋顶',
    direction: { north: '北', south: '南', east: '东', west: '西' },
    wall: { bearing: '墙', partition: '墙', fence: '围墙', parapet: '女儿墙', railing: '栏杆' },
    opening: { door: '门', 'sliding-door': '推拉门', gate: '大门', window: '窗', opening: '洞口' },
    glassBlock: w => `玻璃砖${w}`,
    spaceWall: (s, d, w) => `${s}${d ? VOCABULARY.zh.direction[d] : ''}${w}`,
    exteriorWall: d => `${d ? VOCABULARY.zh.direction[d] : ''}外墙`,
    levelWall: (l, w) => `${l}${w}`,
    axisWall: (h, w) => `${h ? '东西向' : '南北向'}${w}`,
    numbered: (b, n) => `${b}（${n}）`,
  },
  en: {
    level: i => `Level ${i + 1}`,
    roof: 'Roof',
    direction: { north: 'North', south: 'South', east: 'East', west: 'West' },
    wall: { bearing: 'wall', partition: 'wall', fence: 'fence', parapet: 'parapet', railing: 'railing' },
    opening: { door: 'Door', 'sliding-door': 'Sliding door', gate: 'Gate', window: 'Window', opening: 'Opening' },
    glassBlock: w => `Glass-block ${lower(w)}`,
    spaceWall: (s, d, w) => `${s} ${d ? `${lower(VOCABULARY.en.direction[d])} ` : ''}${w}`,
    exteriorWall: d => (d ? `${VOCABULARY.en.direction[d]} exterior wall` : 'Exterior wall'),
    levelWall: (l, w) => `${l} ${w}`,
    axisWall: (h, w) => capital(`${h ? 'east-west' : 'north-south'} ${w}`),
    numbered: (b, n) => `${b} (${n})`,
  },
};

/** Vocabulary for a language, or for a project's language (projects without one are Chinese) */
export function names(of: ProjectLanguage | Pick<Project, 'language'> = 'zh'): Vocabulary {
  const lang = typeof of === 'string' ? of : of.language;
  return VOCABULARY[lang] ?? VOCABULARY.zh;
}

/** Direction of a unit vector (x east, y south), by its dominant axis */
export function directionOf(v: [number, number]): Direction {
  return Math.abs(v[0]) > Math.abs(v[1]) ? (v[0] > 0 ? 'east' : 'west') : v[1] > 0 ? 'south' : 'north';
}

/** Space names that count as bedrooms for the “bedroom needs a window” rule, in every project language */
export const BEDROOM_NAME = /卧|老人房|客房|儿童房|书房|bedroom|guest room|nursery|study/i;
