/**
 * What a space is for, as a designer finishes it (issue 217): its role decides its floor in a design language (see `finishes` in
 * render/styles.ts). The house generator records each room's type (`extras.room`); designs made otherwise are read from the
 * space's name, in either project language, and its kind (outdoor, roof terrace, semi-outdoor).
 */
import type { Space } from './schema.js';

export const ROOM_ROLES = [
  'living',
  'dining',
  'kitchen',
  'bedroom',
  'study',
  'bath',
  'laundry',
  'storage',
  'hall',
  'stair',
  'shrine',
  'tea',
  'garage',
  'porch',
  'balcony',
  'terrace',
  'courtyard',
  'garden',
] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];

/** The generator's room types and its own spaces, as roles */
const FROM_TYPE: Record<string, RoomRole> = {
  living: 'living',
  dining: 'dining',
  kitchen: 'kitchen',
  master: 'bedroom',
  bedroom: 'bedroom',
  elder: 'bedroom',
  kids: 'bedroom',
  study: 'study',
  bath: 'bath',
  storage: 'storage',
  laundry: 'laundry',
  shrine: 'shrine',
  tea: 'tea',
  family: 'hall',
  garage: 'garage',
  corridor: 'hall',
  stair: 'stair',
  veranda: 'porch',
  terrace: 'terrace',
  courtyard: 'courtyard',
};

/** Names, first match wins: the more specific words before the general ones (厅 is a hall unless it is a 客厅 or 餐厅) */
const FROM_NAME: [RegExp, RoomRole][] = [
  [/楼梯|stair/i, 'stair'],
  [/厨|kitchen/i, 'kitchen'],
  [/餐|dining/i, 'dining'],
  [/客厅|起居室|living/i, 'living'],
  [/卧|老人房|客房|儿童房|bedroom|guest room|nursery/i, 'bedroom'],
  [/书房|study|office/i, 'study'],
  [/卫生间|浴|厕|洗手|bath|toilet|wc|shower/i, 'bath'],
  [/洗衣|laundry|utility/i, 'laundry'],
  [/储|杂物|storage|store/i, 'storage'],
  [/神位|佛|shrine/i, 'shrine'],
  [/茶|tea/i, 'tea'],
  [/车库|garage/i, 'garage'],
  [/阳台|balcony/i, 'balcony'],
  [/露台|平台|terrace|roof/i, 'terrace'],
  [/廊|veranda|porch/i, 'porch'],
  [/碎石|草|花园|菜园|gravel|lawn|garden/i, 'garden'],
  [/庭|院|courtyard|yard|patio/i, 'courtyard'],
];

/** What a space is for: its recorded type, else its name, else its kind (indoor rooms with no telling name are halls) */
export function roomRole(s: Space): RoomRole {
  const recorded = s.extras?.room;
  if (typeof recorded === 'string' && FROM_TYPE[recorded]) return FROM_TYPE[recorded];
  const named = FROM_NAME.find(([re]) => re.test(s.name))?.[1];
  const outside = s.kind !== 'indoor' && s.kind !== 'void';
  // An outdoor space named like a room (玄关, an entrance yard) is paving
  if (named && outside === ['porch', 'balcony', 'terrace', 'courtyard', 'garden'].includes(named)) return named;
  if (s.kind === 'roof-terrace') return 'terrace';
  if (s.kind === 'semi-outdoor') return named === 'balcony' ? 'balcony' : 'porch';
  if (s.kind === 'outdoor') return named === 'garden' ? 'garden' : 'courtyard';
  return named ?? 'hall';
}
