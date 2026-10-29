// Converts samples/wushi-<scheme>/legacy.json into a schema-conformant project.json, redecorated in the default design language
// (issue 217: the old page's finishes are replaced as a designer would, the layout untouched), and prints an area comparison.
// Usage: npm run convert -- [scheme=10]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { areaReport, createRegistry, DEFAULT_STYLE_ID, fromLegacy, Session, validate } from '@opensu/core';

const sch = Number(process.argv[2] ?? 10);
const dir = join(import.meta.dirname, '..', `samples/wushi-${sch}`);
const session = new Session(fromLegacy(JSON.parse(readFileSync(join(dir, 'legacy.json'), 'utf8'))));
const r0 = await createRegistry().call('style_apply', { style: DEFAULT_STYLE_ID }, { session, actor: { kind: 'agent' } });
if (!r0.ok) throw new Error(JSON.stringify(r0));
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
