// Builds the texture catalog's images (issue 210): for each set in libraries/textures.json with a Poly Haven source, downloads
// its 1K maps (colour, OpenGL normal, and AO/roughness/metalness packed as glTF's ARM), encodes them as WebP into
// libraries/textures/<id>/, and records the authors and the colour map's average linear colour (the renderer tints a set so a
// surface averages to its material's colour). A `neutral` set's colour map is stored in greys: fabrics and plain finishes come in
// any colour, so all of it comes from the material. Sets whose images exist are left alone unless --force is given.
//
//   node scripts/textures.mjs [--force] [id…]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'libraries/textures.json');
const DIR = join(ROOT, 'libraries/textures');
/** Poly Haven's map names for ours, and the WebP quality of each (picked for size against visible loss at 1K) */
const MAPS = {
  color: { key: 'Diffuse', quality: 82 },
  normal: { key: 'nor_gl', quality: 80 },
  arm: { key: 'arm', quality: 85 },
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter(a => !a.startsWith('--'));

const json = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
};
const download = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
};

/** sRGB 0..255 to linear 0..1 */
const linear = v => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** The image's average colour, linear, averaged in linear light */
async function average(file) {
  const { data, info } = await sharp(file).resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += info.channels) for (let c = 0; c < 3; c++) sum[c] += linear(data[i + c]);
  const n = data.length / info.channels;
  return sum.map(s => Math.round((s / n) * 1e4) / 1e4);
}

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
for (const [id, set] of Object.entries(catalog.textures)) {
  const ph = set.source?.polyhaven;
  if (!ph || (only.length && !only.includes(id))) continue;
  const dir = join(DIR, id);
  const maps = Object.fromEntries(Object.keys(MAPS).map(k => [k, `${id}/${k}.webp`]));
  const have = Object.values(maps).every(f => existsSync(join(DIR, f)));
  if (!have || force) {
    const files = await json(`https://api.polyhaven.com/files/${ph}`);
    mkdirSync(dir, { recursive: true });
    for (const [k, { key, quality }] of Object.entries(MAPS)) {
      const src = files[key]?.['1k']?.jpg?.url;
      if (!src) throw new Error(`${ph}: no 1K ${key} map`);
      let img = sharp(await download(src)).resize(1024, 1024, { fit: 'fill' });
      if (k === 'color' && set.neutral) img = img.greyscale().toColourspace('srgb');
      await img.webp({ quality }).toFile(join(DIR, maps[k]));
    }
    const info = await json(`https://api.polyhaven.com/info/${ph}`);
    set.source = { ...set.source, url: `https://polyhaven.com/a/${ph}`, authors: Object.keys(info.authors ?? {}), license: 'CC0-1.0' };
    console.log(`${id}: ${ph}`);
  }
  set.maps = maps;
  set.average = await average(join(DIR, maps.color));
}
writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);
