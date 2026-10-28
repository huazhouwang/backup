import { describe, expect, it } from 'vitest';
import {
  autoShots,
  buildHouse,
  createProject,
  migrate,
  netArea,
  pointInPolygon,
  STYLE_PRESETS,
  stylePreset,
  stylePrompt,
  zStylesFile,
  type Project,
} from '../../src/index.js';
import { libraryFile, messages, sampleFile } from '../support.js';

const sample = () => migrate(sampleFile()) as Project;
const generated = () => {
  const p = createProject({ id: 'x', name: 'h', language: 'zh' });
  buildHouse(
    p,
    {
      floors: 2,
      rooms: [{ type: 'living', area: 30 }, { type: 'kitchen' }, { type: 'dining' }, { type: 'elder', floor: 0 }, { type: 'master' }, { type: 'kids' }],
    },
    'bar',
  );
  return p;
};

describe('automatic shots', () => {
  for (const [name, make] of [
    ['the sample', sample],
    ['a generated house', generated],
  ] as const)
    it(`picks the aerial, the street and the largest rooms of ${name}`, () => {
      const p = make();
      const shots = autoShots(p);
      expect(shots.slice(0, 2).map(s => s.kind)).toEqual(['aerial', 'street']);
      const rooms = shots.filter(s => s.kind === 'room');
      expect(rooms.length).toBeGreaterThanOrEqual(2);
      expect(rooms.length).toBeLessThanOrEqual(4);
      expect(new Set(shots.map(s => s.id)).size).toBe(shots.length);
      const areas = rooms.map(r =>
        netArea(
          p.spaces.find(s => s.id === r.space)!,
          p.walls,
        ),
      );
      expect(areas).toEqual([...areas].sort((a, b) => b - a));
      for (const r of rooms) {
        const s = p.spaces.find(x => x.id === r.space)!;
        const level = p.levels.find(l => l.id === s.level)!;
        // Standing inside the room at eye height, looking across it
        expect(s.shape.some(poly => pointInPolygon([r.eye[0], r.eye[2]], poly))).toBe(true);
        expect(r.eye[1] - level.elevation).toBe(1500);
        expect(Math.hypot(r.eye[0] - r.target[0], r.eye[2] - r.target[2])).toBeGreaterThan(2000);
      }
    });

  it('has nothing to shoot in an empty design', () => {
    const p = createProject({ id: 'x', name: 'h', language: 'zh' });
    p.walls = [];
    expect(autoShots(p)).toEqual([]);
  });
});

describe('style presets', () => {
  it('are a valid file with 8 or more styles named in both languages', () => {
    expect(zStylesFile.safeParse(libraryFile('styles.json')).success).toBe(true);
    expect(STYLE_PRESETS.length).toBeGreaterThanOrEqual(8);
    for (const s of STYLE_PRESETS) expect(s.name.zh && s.name.en).toBeTruthy();
    expect(STYLE_PRESETS.map(s => s.name.zh)).toEqual(
      expect.arrayContaining(['现代简约', '新中式', '古风', '日式', '北欧', '法式', '美式', '地中海', '工业风']),
    );
  });

  it('are found by the keys the brief records styles as', () => {
    expect(stylePreset('nordic')?.id).toBe('scandinavian');
    expect(stylePreset('chinese')?.id).toBe('new-chinese');
    expect(stylePreset('french')?.id).toBe('french');
    expect(stylePreset('nonsense')).toBeUndefined();
  });

  it('build prompts that keep the building and carry the style', () => {
    const french = STYLE_PRESETS.find(s => s.id === 'french')!;
    const out = stylePrompt(french, false),
      inside = stylePrompt(french, true);
    expect(out.prompt).toContain('exactly');
    expect(out.prompt).toContain(french.exterior);
    expect(inside.prompt).toContain(french.interior);
    expect(out.negative).toContain('extra floors');
  });

  it('name their shots in both UI languages', () => {
    for (const k of ['core_shot_aerial', 'core_shot_street']) for (const l of ['zh', 'en']) expect(messages(l)[k]).toBeTruthy();
  });
});
