// Converts samples/wushi-<scheme>/legacy.json into a schema-conformant project.json and prints an area comparison.
// Usage: npm run convert -- [scheme=10]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { areaReport, fromLegacy, validate } from '@plinth/core';

const sch = Number(process.argv[2] ?? 10);
const dir = join(import.meta.dirname, '..', `samples/wushi-${sch}`);
const project = fromLegacy(JSON.parse(readFileSync(join(dir, 'legacy.json'), 'utf8')));
const issues = validate(project);
if (issues.length) {
  for (const i of issues) console.error(`${i.path}: ${i.message}`);
  process.exit(1);
}
writeFileSync(join(dir, 'project.json'), JSON.stringify(project, null, 1) + '\n');
const r = areaReport(project);
for (const l of r.levels) console.log(`${l.name} gross area ${l.gross.toFixed(2)} m², ${l.spaces.length} spaces`);
console.log(`Total gross area ${r.totalGross.toFixed(2)} m² → ${join(dir, 'project.json')}`);
