// Runs the legacy page in a headless browser and captures the design data as-is, as raw input for conversion and the baseline for area acceptance.
// Usage: node scripts/extract-legacy.mjs [scheme=10]
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sch = Number(process.argv[2] ?? 10);
const page_url = pathToFileURL(join(root, 'legacy/wushi-courtyard.html')).href + `#s${sch}`;
const out = join(root, `samples/wushi-${sch}`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
// The legacy page generates IDs with Math.random; a fixed seed keeps every export identical
await page.addInitScript(() => {
  let a = 20261022;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
});
await page.goto(page_url, { waitUntil: 'load' });
await page.waitForFunction(() => typeof D !== 'undefined' && D.floors, null, { timeout: 30000 });

const data = await page.evaluate(() => {
  const clone = v => JSON.parse(JSON.stringify(v));
  let stair = null;
  try {
    stair = clone(stairGeo());
  } catch (e) {
    stair = { error: String(e) };
  }
  return {
    legacy: {
      scheme: SCH,
      name: SCHN,
      design: clone(D),
      cfg: clone(CFG6),
      consts: clone({ LAT, LON, TZ, SITE, FB, FN, H1, FH, GL, STAIR, SX, POND, DRAINS, PLANTER_X, PLANTER_Y, DECK, STEPS, SLOPES, OPD }),
      stair,
      catalog: clone(CAT),
      materials: clone(MATS),
    },
    expected: {
      note: '旧页面算出的面积（㎡）：使用面积按墙内净尺寸，建筑面积量到外墙外皮',
      floors: D.floors.map((fl, i) => ({
        level: FN[i],
        gross: grossArea(fl),
        rooms: fl.rooms.filter(r => r.kind !== 'void').map(r => ({ name: r.name, kind: r.kind, net: netArea(r, fl.walls) })),
      })),
    },
  };
});
await browser.close();

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'legacy.json'), JSON.stringify(data.legacy, null, 1) + '\n');
writeFileSync(join(out, 'expected-areas.json'), JSON.stringify(data.expected, null, 1) + '\n');
console.log(`Scheme ${sch}: ${data.legacy.design.floors.length} floors, written to ${out}`);
if (errors.length) console.log('Page errors (data unaffected):\n' + errors.join('\n'));
