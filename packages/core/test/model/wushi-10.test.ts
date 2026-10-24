import { sampleFile } from '../support.js';
import { describe, expect, it } from 'vitest';
import { areaReport, fromLegacy, migrate, validate } from '../../src/index.js';

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
  it('rejects non-Plinth files and newer versions', () => {
    expect(() => migrate({})).toThrow();
    expect(() => migrate({ schema: 'plinth/project', version: 99 })).toThrow(/newer than/);
  });
});
