// Builds the plant catalog's images (issue 214): for each plant in libraries/plants.json with a Poly Haven source, downloads the
// model (glTF, 1K textures), renders the chosen node in headless Chromium with three.js (orthographic, a soft light baked in,
// transparent background) from the front, the side and above, and writes the views as WebP with alpha into
// libraries/plants/<id>/, recording the plant's real size and the authors. Plants whose images exist are left alone unless
// --force is given.
//
//   node scripts/plants.mjs [--force] [id…]
//   node scripts/plants.mjs --nodes <polyhaven id>    (lists a model's nodes and their sizes, to pick one)
//
// A source names one node (index or name), "all" (a plant modelled in parts), or a patch: { nodes, count, radius (mm) }
// scattered over a disc, for grasses and ground covers.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'libraries/plants.json');
const DIR = join(ROOT, 'libraries/plants');
const CACHE = join(tmpdir(), 'opensu-plants');
const THREE = join(ROOT, 'node_modules/three');
/** Pixels along a view's longer side */
const SIZE = 1024;

const args = process.argv.slice(2);
const force = args.includes('--force');
const nodesOf = args.includes('--nodes') ? args[args.indexOf('--nodes') + 1] : null;
const only = args.filter(a => !a.startsWith('--') && a !== nodesOf);

const json = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
};

/** The model's glTF and the files it includes, downloaded once into the cache */
async function model(ph) {
  const dir = join(CACHE, ph);
  const g = (await json(`https://api.polyhaven.com/files/${ph}`)).gltf['1k'].gltf;
  for (const [path, { url }] of Object.entries({ [`${ph}.gltf`]: { url: g.url }, ...g.include })) {
    const file = join(dir, path);
    if (existsSync(file)) continue;
    mkdirSync(dirname(file), { recursive: true });
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  return `/models/${ph}/${ph}.gltf`;
}

/** Serves three.js and the downloaded models to the page */
function serve() {
  const types = { '.js': 'text/javascript', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png' };
  const server = createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = url.startsWith('/three/') ? join(THREE, url.slice(7)) : url.startsWith('/models/') ? join(CACHE, url.slice(8)) : null;
    if (url === '/')
      return res.end(
        '<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>',
      );
    if (!file || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise(ok => server.listen(0, () => ok(server)));
}

/** In the page: the model's top-level nodes with their sizes (mm), or one node rendered from the front, the side and above */
async function inPage({ url, node, size, patch }) {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const nodes = root.children.length === 1 && root.children[0].children.length > 1 ? root.children[0].children : root.children;
  const box = o => new THREE.Box3().setFromObject(o);
  if (node === undefined)
    return nodes.map((o, i) => {
      const s = box(o).getSize(new THREE.Vector3());
      return { i, name: o.name, w: Math.round(s.x * 1000), h: Math.round(s.y * 1000), d: Math.round(s.z * 1000) };
    });
  // 'all': the whole model (a plant modelled as several parts: trunk, leaves, pot)
  const picked = node === 'all' ? root : typeof node === 'number' ? nodes[node] : nodes.find(o => o.name === node);
  const scene = new THREE.Scene();
  let plant = picked.clone();
  // A patch: many small clumps (grasses, ground covers) scattered over a disc, as landscape libraries sell them
  if (patch) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    plant = new THREE.Group();
    for (let i = 0; i < patch.count; i++) {
      const pick = patch.nodes[Math.floor(rnd() * patch.nodes.length)];
      const c = nodes[pick].clone();
      const r = (patch.radius / 1000) * Math.sqrt(rnd()),
        a = rnd() * Math.PI * 2;
      const cb = box(c),
        cc = cb.getCenter(new THREE.Vector3());
      c.position.sub(new THREE.Vector3(cc.x, cb.min.y, cc.z));
      const g = new THREE.Group();
      g.add(c);
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.rotation.y = rnd() * Math.PI * 2;
      g.scale.setScalar(0.8 + rnd() * 0.4);
      plant.add(g);
    }
    plant.updateMatrixWorld(true);
  }
  // Standing at the origin on the ground
  const b = box(plant);
  const c = b.getCenter(new THREE.Vector3());
  plant.position.sub(new THREE.Vector3(c.x, b.min.y, c.z));
  scene.add(plant);
  // Soft studio light: a sky above and a warm key from the front-left, as a plant photographed outdoors in the shade
  scene.add(new THREE.HemisphereLight(0xf2f4f7, 0x8c8577, 2.2));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.6);
  key.position.set(-2, 3, 4);
  scene.add(key);
  const dims = b.getSize(new THREE.Vector3());
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  // A view w × h metres of the plant, looking at `at` from `dir`, `up` being the top of the image
  const view = (w, h, at, dir, up) => {
    const k = size / Math.max(w, h);
    renderer.setSize(Math.round(w * k), Math.round(h * k));
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.01, 100);
    cam.up.copy(up);
    cam.position.copy(at).addScaledVector(dir, 50);
    cam.lookAt(at);
    renderer.render(scene, cam);
    return renderer.domElement.toDataURL('image/png');
  };
  const middle = new THREE.Vector3(0, dims.y / 2, 0),
    up = new THREE.Vector3(0, 1, 0);
  return {
    w: Math.round(dims.x * 1000),
    d: Math.round(dims.z * 1000),
    h: Math.round(dims.y * 1000),
    front: view(dims.x, dims.y, middle, new THREE.Vector3(0, 0, 1), up),
    side: view(dims.z, dims.y, middle, new THREE.Vector3(1, 0, 0), up),
    // From above, north (−z) at the top, as the plan
    top: view(dims.x, dims.z, new THREE.Vector3(0, 0, 0), up, new THREE.Vector3(0, 0, -1)),
  };
}

const server = await serve();
const base = `http://localhost:${server.address().port}`;
// CHROMIUM: a browser binary other than Playwright's own (e.g. a preinstalled one)
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(base);
try {
  if (nodesOf) {
    console.log(await page.evaluate(inPage, { url: base + (await model(nodesOf)) }));
  } else {
    const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
    for (const [id, plant] of Object.entries(catalog.plants)) {
      const ph = plant.source?.polyhaven;
      if (!ph || (only.length && !only.includes(id))) continue;
      const views = Object.fromEntries(['front', 'side', 'top'].map(v => [v, `${id}/${v}.webp`]));
      if (Object.values(views).every(f => existsSync(join(DIR, f))) && !force) continue;
      const out = await page.evaluate(inPage, { url: base + (await model(ph)), node: plant.source.node ?? 0, size: SIZE, patch: plant.source.patch });
      mkdirSync(join(DIR, id), { recursive: true });
      for (const v of ['front', 'side', 'top'])
        await sharp(Buffer.from(out[v].split(',')[1], 'base64'))
          .webp({ quality: 85, alphaQuality: 90 })
          .toFile(join(DIR, views[v]));
      const info = await json(`https://api.polyhaven.com/info/${ph}`);
      plant.source = { ...plant.source, url: `https://polyhaven.com/a/${ph}`, authors: Object.keys(info.authors ?? {}), license: 'CC0-1.0' };
      plant.size = { w: out.w, d: out.d, h: out.h };
      plant.views = views;
      console.log(`${id}: ${ph} ${out.w}×${out.d}×${out.h} mm`);
    }
    writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);
  }
} finally {
  await browser.close();
  server.close();
}
