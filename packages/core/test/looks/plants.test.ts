// Image plants (issue 214): the built-in catalog, the plant part, and plants in the plan symbol
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRecipe, builtPlan, checkRecipe, PLANTS } from '../../src/index.js';
import { libraryFile } from '../support.js';

const LIBRARIES = join(import.meta.dirname, '../../../../libraries');

describe('image plants', () => {
  it('the catalog has the format the schema describes; every plant is CC0 with its views on disk', () => {
    const schema = libraryFile('plants.schema.json');
    const f = libraryFile('plants.json');
    expect(f.$schema).toBe('./plants.schema.json');
    for (const k of schema.required) expect(f).toHaveProperty(k);
    expect(Object.keys(PLANTS).length).toBeGreaterThanOrEqual(8);
    for (const [id, p] of Object.entries(PLANTS)) {
      expect(id).toMatch(new RegExp(schema.properties.plants.propertyNames.pattern));
      expect(p.source.license, id).toBe('CC0-1.0');
      for (const v of Object.values(p.views)) expect(existsSync(join(LIBRARIES, 'plants', v)), `${id}: ${v}`).toBe(true);
    }
    for (const kind of ['tree', 'shrub', 'ground', 'potted'])
      expect(
        Object.values(PLANTS).some(p => p.kind === kind),
        kind,
      ).toBe(true);
  });

  it('a look draws a plant at a height, keeping its proportions or stretched to a spread, and shows it from above in the plan', async () => {
    const tree = PLANTS['tree-island'];
    const { parts } = await buildRecipe(
      { script: `[$plant('tree-island', [100, 0, 0], 3000), $plant('fern', [0, 0, 0], 400, 30, [800, 600])]` },
      { w: 1, d: 1, h: 1 },
    );
    expect(parts[0]).toMatchObject({ kind: 'plant', plant: 'tree-island', h: 3000, rot: 0 });
    expect(parts[0]).toHaveProperty('w', (tree.size.w * 3000) / tree.size.h);
    expect(parts[1]).toMatchObject({ w: 800, d: 600, rot: 30 });
    const plan = builtPlan({ parts });
    expect(plan.plants).toHaveLength(2);
    expect(plan.plants![0]).toMatchObject({ plant: 'tree-island', at: [100, 0] });
  });

  it('a plant that is not in the catalog is refused, naming the ones there are', async () => {
    const [problem] = await checkRecipe({ script: `[$plant('palm', [0, 0, 0], 2000)]` }, { w: 1000, d: 1000, h: 1000 });
    expect(problem).toMatch(/unknown plant palm \(one of .*tree-island/);
  });
});
