// Texture sets (issue 210): the built-in catalog, materials naming a set, and the size a set is laid at
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIBRARY, DEFAULT_MATERIALS, parseLibrary, TEXTURES, textureOf, textureSize, type Material } from '../../src/index.js';
import { libraryFile } from '../support.js';

const LIBRARIES = join(import.meta.dirname, '../../../../libraries');
const plain = (extras: Material['extras']): Material => ({ name: { en: 'x' }, pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1] }, extras });

describe('texture sets', () => {
  it('the catalog has the $schema and format the schema file describes', () => {
    const schema = libraryFile('textures.schema.json');
    const f = libraryFile('textures.json');
    expect(f.$schema).toBe('./textures.schema.json');
    for (const k of schema.required) expect(f).toHaveProperty(k);
    for (const [id, set] of Object.entries<Record<string, unknown>>(f.textures)) {
      expect(id).toMatch(new RegExp(schema.properties.textures.propertyNames.pattern));
      for (const k of Object.keys(set)) expect(schema.$defs.set.properties, `${id}.${k}`).toHaveProperty(k);
    }
  });

  it('every set is CC0, has its images on disk and an average colour', () => {
    expect(Object.keys(TEXTURES).length).toBeGreaterThan(10);
    for (const [id, set] of Object.entries(TEXTURES)) {
      expect(set.source.license, id).toBe('CC0-1.0');
      for (const path of Object.values(set.maps)) expect(existsSync(join(LIBRARIES, 'textures', path)), `${id}: ${path}`).toBe(true);
      expect(
        set.average.every(c => c > 0 && c < 1),
        id,
      ).toBe(true);
      if (set.neutral) expect(Math.max(...set.average) - Math.min(...set.average), `${id} is in greys`).toBeLessThan(0.005);
    }
  });

  it("the default library's surfaces are textured, with sets that exist", () => {
    const textured = Object.entries(DEFAULT_MATERIALS).filter(([, m]) => m.extras?.texture);
    expect(textured.length).toBeGreaterThan(20);
    for (const [k, m] of textured) expect(textureOf(m), k).toBeDefined();
    for (const k of ['wall', 'paint', 'redbrick', 'oak', 'tile', 'grass', 'wood', 'fabric']) expect(DEFAULT_MATERIALS[k].extras?.texture, k).toBeDefined();
  });

  it('is laid at its real size, scaled to a pattern material’s own tile, brick or board', () => {
    const brick = TEXTURES.brick;
    expect(textureSize(plain({ texture: 'brick' }), brick)).toEqual(brick.size);
    const [w] = textureSize(plain({ texture: 'brick', pattern: 'bricks', size: [240, 53] }), brick);
    expect(w).toBeCloseTo((brick.size[0] * 240) / brick.unit![0]);
    // A set without a unit keeps its size whatever the pattern
    const stucco = TEXTURES.stucco;
    expect(textureSize(plain({ texture: 'stucco', pattern: 'tiles', size: 300 }), stucco)).toEqual(stucco.size);
  });

  it('a library naming a set that does not exist is refused, naming the sets there are', () => {
    const lib = libraryFile('chinese.looklib.json');
    const materials = { ...lib.materials, odd: plain({ texture: 'nowhere' }) };
    expect(() => parseLibrary({ ...lib, materials }, DEFAULT_LIBRARY)).toThrow(/materials\.odd: unknown texture set nowhere \(one of .*stucco/);
  });
});
