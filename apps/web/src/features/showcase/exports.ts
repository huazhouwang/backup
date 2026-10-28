/**
 * Images to post (issue 196): a render laid out for where people share it, 3:4 (Xiaohongshu posts), 1:1 and 9:16 (stories), 1080 px wide.
 * The whole render is kept (no crop) over a blurred fill of itself, with the house's name, its size, the OpenSU mark and the
 * label saying the image is generated in a band at the bottom, in the light theme's colours.
 */
import { lightDocument } from '@/canvas/CanvasFrame';
import { download } from '@/lib/download';
import { themeColor } from '@/lib/theme';

export const EXPORT_RATIOS = { portrait: [3, 4], square: [1, 1], story: [9, 16] } as const;
export type ExportRatio = keyof typeof EXPORT_RATIOS;

const load = async (src: string) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
};

export async function composeExport(src: string, ratio: ExportRatio, text: { title: string; facts: string; label: string }): Promise<string> {
  const [rw, rh] = EXPORT_RATIOS[ratio];
  const W = 1080,
    H = Math.round((W * rh) / rw);
  const [img, doc] = await Promise.all([load(src), lightDocument()]);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const iw = img.naturalWidth || 1024,
    ih = img.naturalHeight || 768;

  // A blurred fill of the render behind it, then the render itself, whole, above the band
  const band = Math.round(W * 0.2);
  // Drawn larger than the frame, so the blur doesn't darken the edges
  const cover = Math.max(W / iw, H / ih) * 1.2;
  ctx.filter = 'blur(40px) saturate(1.1)';
  ctx.drawImage(img, (W - iw * cover) / 2, (H - ih * cover) / 2, iw * cover, ih * cover);
  ctx.filter = 'none';
  const fit = Math.min(W / iw, (H - band) / ih);
  const dw = iw * fit,
    dh = ih * fit;
  ctx.drawImage(img, (W - dw) / 2, (H - band - dh) / 2, dw, dh);

  // The band: name and size on the left, the mark on the right
  ctx.fillStyle = themeColor('--background', doc);
  ctx.fillRect(0, H - band, W, band);
  const pad = 56;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = themeColor('--foreground', doc);
  ctx.font = '600 52px system-ui, sans-serif';
  ctx.fillText(text.title, pad, H - band + band * 0.46, W * 0.66);
  ctx.fillStyle = themeColor('--muted-foreground', doc);
  ctx.font = '32px system-ui, sans-serif';
  ctx.fillText(text.facts, pad, H - band + band * 0.74, W * 0.66);
  ctx.textAlign = 'right';
  ctx.fillStyle = themeColor('--foreground', doc);
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillText('OpenSU', W - pad, H - band + band * 0.46);
  // Generated images are labelled as such, visibly (as rules on AI-generated content ask)
  ctx.fillStyle = themeColor('--muted-foreground', doc);
  ctx.font = '26px system-ui, sans-serif';
  ctx.fillText(text.label, W - pad, H - band + band * 0.74);
  return canvas.toDataURL('image/jpeg', 0.9);
}

export async function downloadExport(src: string, ratio: ExportRatio, text: { title: string; facts: string; label: string }, filename: string) {
  await download(await composeExport(src, ratio, text), `${filename}-${EXPORT_RATIOS[ratio].join('x')}.jpg`);
}
