import { migrate, pointInPolygon, type Project } from '@opensu/core';
import { describe, expect, it } from 'vitest';
import sampleJson from '../../../../../../samples/wushi-10/project.json';
import { walkStart } from './WalkView';

const p: Project = migrate(sampleJson);

describe('where a walk starts', () => {
  it('in the selected room, else the largest indoor room of the level, inside it', () => {
    const kitchen = p.spaces.find(s => s.name === '厨房')!; // i18n-ok: sample data name
    const at = walkStart(p, 'L1', kitchen.id)!;
    expect(kitchen.shape.some(poly => pointInPolygon(at, poly))).toBe(true);
    const living = p.spaces.find(s => s.name === '客厅')!; // i18n-ok: sample data name
    const largest = walkStart(p, 'L1')!;
    expect(living.shape.some(poly => pointInPolygon(largest, poly))).toBe(true);
  });
});
