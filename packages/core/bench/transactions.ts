/** Transaction cost on the sample project: `npm run bench` (not part of CI; timings vary by machine). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRegistry, migrate, Session } from '../src/index.js';

const sample = migrate(JSON.parse(readFileSync(join(import.meta.dirname, '../../../samples/wushi-10/project.json'), 'utf8')));
const registry = createRegistry();
const session = new Session(structuredClone(sample));
const ctx = { session, actor: { kind: 'user' as const } };
const wall = sample.walls.find(w => w.kind === 'partition' && w.start[0] === w.end[0])!;
const space = sample.spaces.find(s => s.kind === 'indoor')!;

async function bench(label: string, runs: number, call: (i: number) => Promise<unknown>) {
  for (let i = 0; i < 3; i++) await call(i);
  const t = performance.now();
  for (let i = 0; i < runs; i++) await call(i);
  console.log(`${label.padEnd(16)} ${((performance.now() - t) / runs).toFixed(1)} ms`);
}

await bench('wall_move', 30, i => registry.call('wall_move', { wall: wall.id, direction: i % 2 ? 'east' : 'west', distance: 100 }, ctx));
await bench('space_set_area', 20, i => registry.call('space_set_area', { space: space.id, area: 10 + (i % 2) }, ctx));
await bench('furniture_move', 30, i => registry.call('furniture_move', { furniture: sample.furniture[0].id, by: [i % 2 ? 50 : -50, 0] }, ctx));
