import { sampleFile } from '../support.js';
import { describe, expect, it } from 'vitest';
import { areaReport, fromLegacy, migrate, SCHEMA_VERSION, validate } from '../../src/index.js';

const read = sampleFile;
const legacy = read('legacy.json');
const expected = read('expected-areas.json') as {
  floors: { level: string; gross: number; rooms: { name: string; net: number }[] }[];
};

describe('乌石合院 scheme 10', () => {
  const project = migrate(read('project.json'));

  it('committed project.json matches the conversion output (conversion is rerunnable)', () => {
    expect(project).toEqual(fromLegacy(legacy));
  });

  it('passes structural validation', () => {
    expect(validate(project)).toEqual([]);
  });

  it('per-level gross area and per-room usable area match the legacy page (error < 0.01 m²)', () => {
    const report = areaReport(project);
    expect(report.levels.map(l => l.name)).toEqual(expected.floors.map(f => f.level));
    report.levels.forEach((l, i) => {
      const exp = expected.floors[i];
      expect(l.gross, `${l.name} gross area`).toBeCloseTo(exp.gross, 2);
      expect(l.spaces.map(s => s.net)).toHaveLength(exp.rooms.length);
      l.spaces.forEach((s, j) => expect(s.net, `${l.name}·${s.name}`).toBeCloseTo(exp.rooms[j].net, 2));
    });
  });

  it('the stairs land on floor: each stairwell room above keeps its floor, cut by a void the size of the stair (v9)', () => {
    for (const id of ['L2-s03', 'L3-s03', 'RF-s02']) {
      const room = project.spaces.find(s => s.id === id)!;
      expect(room.slabOpening).toBeUndefined();
      const hole = project.spaces.find(s => s.id === `${id}-void`)!;
      expect(hole).toMatchObject({ kind: 'void', level: room.level, name: '楼梯洞口' }); // i18n-ok: sample data name
    }
  });

  it('object names are unique within a level and usable as references', () => {
    for (const l of project.levels) {
      for (const list of [project.walls, project.spaces, project.furniture]) {
        const names = list.filter(o => o.level === l.id).map(o => o.name);
        expect(new Set(names).size, l.name).toBe(names.length);
      }
    }
  });
});

describe('migrate', () => {
  it('rejects non-OpenSU files and newer versions', () => {
    expect(() => migrate({})).toThrow();
    expect(() => migrate({ schema: 'opensu/project', version: 99 })).toThrow(/newer than/);
    expect(() => migrate({ schema: 'plinth/project', version: 20 })).toThrow(/Not an OpenSU project/);
  });

  it('opens projects saved as plinth/project before the rename (v20, #179)', () => {
    const old = { ...migrate(read()), schema: 'plinth/project', version: 19 };
    expect(migrate(old)).toMatchObject({ schema: 'opensu/project', version: SCHEMA_VERSION });
  });

  it('drops the model axes (v13) and the guides (v14) of older projects', () => {
    const doc = {
      ...migrate(read()),
      version: 12,
      axes: { origin: [100, 200] },
      guides: [{ id: 'g1', name: 'x₁', kind: 'line', at: [0, 0, 0], dir: [1, 0, 0], axis: 'x' }],
    };
    const p = migrate(doc) as unknown as Record<string, unknown>;
    expect(p.axes).toBeUndefined();
    expect(p.guides).toBeUndefined();
  });
});
