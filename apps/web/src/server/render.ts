/**
 * Image providers for style renders (issue 195). A render starts from passes of the 3D model (colour, depth, lines, mask: see
 * graphics/three/render-passes.ts) and a prompt (core's stylePrompt); a provider turns them into an image. Which one runs is the
 * deployment's choice: RENDER_PROVIDER (`openai`, `seedream`, `fal`, or `placeholder`), RENDER_MODEL, RENDER_KEY and optionally
 * RENDER_BASE_URL. Until a key is configured the placeholder draws the colour pass in the style's palette, labelled as an
 * illustration, so the whole flow (credits, storage, gallery, sharing) works and can be tested.
 */
import { env } from 'cloudflare:workers';
import { HTTPException } from 'hono/http-exception';
import { m } from '@/lib/i18n';

export const RENDER_PASSES = ['color', 'depth', 'lines', 'mask'] as const;
export type RenderPass = (typeof RENDER_PASSES)[number];

export interface RenderInput {
  /** The passes the provider asked for, as data URLs */
  passes: Partial<Record<RenderPass, string>>;
  prompt: string;
  negative: string;
  width: number;
  height: number;
  /** For the placeholder: the style's colours (lightest first) and its name */
  palette: string[];
  styleName: string;
}

export interface RenderProvider {
  id: string;
  /** Passes it is conditioned on (the client renders and sends only these) */
  passes: RenderPass[];
  /** Credits one image costs */
  credits: number;
  render(input: RenderInput): Promise<string>;
}

interface RenderEnv {
  RENDER_PROVIDER?: string;
  RENDER_MODEL?: string;
  RENDER_KEY?: string;
  RENDER_BASE_URL?: string;
  RENDER_CREDITS?: string;
}
const e = () => env as unknown as RenderEnv;

/** The deployment's provider; the placeholder when none is configured (or its key is missing) */
export function renderProvider(): RenderProvider {
  const { RENDER_PROVIDER: id, RENDER_MODEL: model, RENDER_KEY: key, RENDER_BASE_URL: base, RENDER_CREDITS: credits } = e();
  const cost = (fallback: number) => (credits && Number.isFinite(Number(credits)) && Number(credits) >= 0 ? Number(credits) : fallback);
  if (key && id === 'openai') return { id, passes: ['color'], credits: cost(4), render: i => openai(i, key, model, base) };
  if (key && id === 'seedream') return { id, passes: ['color'], credits: cost(4), render: i => seedream(i, key, model, base) };
  if (key && id === 'fal') return { id, passes: ['depth'], credits: cost(5), render: i => fal(i, key, model, base) };
  return { id: 'placeholder', passes: ['color'], credits: cost(1), render: placeholder };
}

const fail = async (r: Response) => {
  console.error('render provider', r.status, (await r.text()).slice(0, 500));
  throw new HTTPException(502, { message: m.server_err_render_failed() });
};
const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);
const bytesOf = (dataUrl: string) => Uint8Array.from(atob(base64Of(dataUrl)), ch => ch.charCodeAt(0));
const base64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const asDataUrl = async (url: string) => {
  if (url.startsWith('data:')) return url;
  const r = await fetch(url);
  if (!r.ok) return fail(r);
  return `data:${r.headers.get('content-type') ?? 'image/jpeg'};base64,${base64(new Uint8Array(await r.arrayBuffer()))}`;
};

/** OpenAI image edit (gpt-image-1): the colour pass edited by the prompt */
async function openai(i: RenderInput, key: string, model = 'gpt-image-1', base = 'https://api.openai.com/v1'): Promise<string> {
  const form = new FormData();
  form.append('model', model);
  form.append('image', new Blob([bytesOf(i.passes.color!)], { type: 'image/jpeg' }), 'shot.jpg');
  form.append('prompt', `${i.prompt}\nAvoid: ${i.negative}.`);
  form.append('size', i.width >= i.height ? '1536x1024' : '1024x1536');
  form.append('quality', 'medium');
  form.append('output_format', 'jpeg');
  form.append('output_compression', '85');
  const r = await fetch(`${base}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!r.ok) return fail(r);
  const json = (await r.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) return fail(new Response(JSON.stringify(json), { status: 502 }));
  return `data:image/jpeg;base64,${b64}`;
}

/** ByteDance Seedream on Volcengine Ark: image-to-image from the colour pass */
async function seedream(i: RenderInput, key: string, model = 'doubao-seedream-4-0-250828', base = 'https://ark.cn-beijing.volces.com/api/v3'): Promise<string> {
  const r = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: `${i.prompt} Avoid: ${i.negative}.`,
      image: i.passes.color,
      size: `${Math.round(i.width * 1.5)}x${Math.round(i.height * 1.5)}`,
      response_format: 'b64_json',
      watermark: false,
    }),
  });
  if (!r.ok) return fail(r);
  const json = (await r.json()) as { data?: { b64_json?: string; url?: string }[] };
  const d = json.data?.[0];
  if (d?.b64_json) return `data:image/jpeg;base64,${d.b64_json}`;
  if (d?.url) return asDataUrl(d.url);
  return fail(new Response(JSON.stringify(json), { status: 502 }));
}

/** FLUX with a depth control image, on fal */
async function fal(i: RenderInput, key: string, model = 'fal-ai/flux-pro/v1/depth', base = 'https://fal.run'): Promise<string> {
  const r = await fetch(`${base}/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: i.prompt,
      control_image_url: i.passes.depth,
      image_size: { width: i.width, height: i.height },
      output_format: 'jpeg',
      sync_mode: true,
    }),
  });
  if (!r.ok) return fail(r);
  const json = (await r.json()) as { images?: { url?: string }[] };
  const url = json.images?.[0]?.url;
  if (!url) return fail(new Response(JSON.stringify(json), { status: 502 }));
  return asDataUrl(url);
}

const xml = (s: string) => s.replace(/[<>&"']/g, ch => `&#${ch.charCodeAt(0)};`);
const channel = (hex: string, at: number) => (parseInt(hex.slice(at, at + 2), 16) / 255).toFixed(3);

/**
 * The placeholder: the colour pass toned in the style's palette (darkest to lightest by brightness), half and half with the
 * original, and labelled as an illustration with the style's name. An SVG, so the Worker needs no image library.
 */
export async function placeholder(i: RenderInput): Promise<string> {
  // Darkest to lightest, whatever order the preset lists its colours in
  const luma = (c: string) => 0.2126 * Number(channel(c, 1)) + 0.7152 * Number(channel(c, 3)) + 0.0722 * Number(channel(c, 5));
  const ramp = [...i.palette].sort((a, b) => luma(a) - luma(b));
  const table = (at: number) => ramp.map(c => channel(c, at)).join(' ');
  const label = `${m.render_placeholder_label()} · ${i.styleName}`;
  const W = i.width,
    H = i.height,
    fontSize = Math.round(H / 32),
    pad = Math.round(fontSize * 0.6),
    boxW = Math.round(label.length * fontSize * 1.05 + pad * 2),
    boxH = fontSize + pad * 2;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    '<filter id="tone" color-interpolation-filters="sRGB">',
    '<feColorMatrix type="saturate" values="0" result="grey"/>',
    `<feComponentTransfer in="grey" result="toned"><feFuncR type="table" tableValues="${table(1)}"/><feFuncG type="table" tableValues="${table(3)}"/><feFuncB type="table" tableValues="${table(5)}"/></feComponentTransfer>`,
    '<feComposite in="toned" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0.6" k3="0.4" k4="0"/>',
    '</filter>',
    `<image width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" filter="url(#tone)" href="${i.passes.color}" xlink:href="${i.passes.color}"/>`,
    `<rect x="${W - boxW - pad}" y="${H - boxH - pad}" width="${boxW}" height="${boxH}" rx="${pad}" fill="${ramp[0]}" fill-opacity="0.85"/>`,
    `<text x="${W - pad * 2}" y="${H - pad * 2 - Math.round(fontSize * 0.15)}" text-anchor="end" font-family="system-ui, sans-serif" font-size="${fontSize}" fill="${ramp[ramp.length - 1]}">${xml(label)}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;base64,${base64(new TextEncoder().encode(svg))}`;
}
