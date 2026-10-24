import { sampleFile } from '../support.js';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { findObject, migrate, projectIndex, type Project } from '../../src/index.js';

const sample = (): Project => migrate(sampleFile());

describe('project index', () => {
  const p = sample();

  it('finds every kind of object with its level and name', () => {
    const wall = p.walls.find(w => w.openings.length)!;
    const opening = wall.openings[0];
    expect(findObject(p, wall.id)).toMatchObject({ kind: 'wall', name: wall.name, level: wall.level, obj: wall });
    expect(findObject(p, opening.id)).toMatchObject({ kind: 'opening', name: opening.name, level: wall.level, obj: opening, wall });
    expect(findObject(p, p.spaces[0].id)).toMatchObject({ kind: 'space', level: p.spaces[0].level });
    expect(findObject(p, p.levels[0].id)).toMatchObject({ kind: 'level', level: p.levels[0].id });
    if (p.furniture[0]) expect(findObject(p, p.furniture[0].id)).toMatchObject({ kind: 'furniture', level: p.furniture[0].level });
    expect(findObject(p, 'no-such-id')).toBeUndefined();
  });

  it('filters by kind', () => {
    expect(findObject(p, p.walls[0].id, 'space')).toBeUndefined();
    expect(projectIndex(p).of('opening')).toHaveLength(p.walls.reduce((n, w) => n + w.openings.length, 0));
  });

  it('caches per project object and sees a new project after a change', () => {
    expect(projectIndex(p)).toBe(projectIndex(p));
    const renamed = produce(p, d => {
      d.spaces[0].name = 'Renamed';
    });
    expect(findObject(renamed, p.spaces[0].id)?.name).toBe('Renamed');
    expect(findObject(p, p.spaces[0].id)?.name).not.toBe('Renamed');
  });

  it('is not stale inside a draft that is still changing', () => {
    produce(p, d => {
      expect(findObject(d, 'new-space')).toBeUndefined();
      d.spaces.push({ ...d.spaces[0], id: 'new-space', name: 'New' });
      expect(findObject(d, 'new-space')?.name).toBe('New');
    });
  });
});
