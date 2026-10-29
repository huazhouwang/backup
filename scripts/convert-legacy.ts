// Converts samples/wushi-<scheme>/legacy.json into a schema-conformant project.json, then replays the designer's pass in
// redecorate.json when there is one (issue 217: finishes and furnishings, the layout untouched), and prints an area comparison.
// Usage: npm run convert -- [scheme=10]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { areaReport, createRegistry, fromLegacy, Session, validate } from '@opensu/core';

const sch = Number(process.argv[2] ?? 10);
const dir = join(import.meta.dirname, '..', `samples/wushi-${sch}`);
const session = new Session(fromLegacy(JSON.parse(readFileSync(join(dir, 'legacy.json'), 'utf8'))));
const pass = join(dir, 'redecorate.json');
const registry = createRegistry();
for (const c of existsSync(pass) ? JSON.parse(readFileSync(pass, 'utf8')).calls : []) {
  const r = await registry.call(c.name, c.input, { session, actor: { kind: 'agent' } });
  if (!r.ok) throw new Error(`${c.name}: ${JSON.stringify(r)}`);
}
const project = session.project;
const issues = validate(project);
if (issues.length) {
  for (const i of issues) console.error(`${i.path}: ${i.message}`);
  process.exit(1);
}
writeFileSync(join(dir, 'project.json'), JSON.stringify(project, null, 1) + '\n');
const r = areaReport(project);
for (const l of r.levels) console.log(`${l.name} gross area ${l.gross.toFixed(2)} m², ${l.spaces.length} spaces`);
console.log(`Total gross area ${r.totalGross.toFixed(2)} m² → ${join(dir, 'project.json')}`);
