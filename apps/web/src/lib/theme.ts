/**
 * Read theme colors for three.js. Theme variables are oklch, which three.js can't parse, so a canvas lets the browser convert them to rgb.
 * The canvas lives in its own light-only iframe, so read from the canvas document; calls from the page read the page document and follow the system color scheme.
 */
import { useEffect, useState } from 'react';

let canvas: HTMLCanvasElement | null = null;

export function themeColor(token: string, doc: Document = document): string {
  canvas ??= document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = doc.defaultView!.getComputedStyle(doc.documentElement).getPropertyValue(token).trim();
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

export function useThemeColors<const T extends Record<string, string>>(tokens: T, doc: Document = document): Record<keyof T, string> {
  const read = () => Object.fromEntries(Object.entries(tokens).map(([k, t]) => [k, themeColor(t, doc)])) as Record<keyof T, string>;
  const [colors, setColors] = useState(read);
  useEffect(() => {
    setColors(read());
    const q = doc.defaultView!.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setColors(read());
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, [doc]);
  return colors;
}

/**
 * Serialize an SVG so it renders on its own (PNG export, plan thumbnails): every theme variable it references
 * gets its current value on the root element, read from the document the SVG lives in. Elements marked
 * data-feedback (selection and change highlights) are left out.
 */
export function standaloneSvg(svg: SVGSVGElement, attrs: Record<string, string> = {}): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Selection and change highlights are interaction state, not part of the drawing
  clone.querySelectorAll('[data-feedback]').forEach(el => el.remove());
  for (const [k, v] of Object.entries(attrs)) clone.setAttribute(k, v);
  const cs = svg.ownerDocument.defaultView!.getComputedStyle(svg);
  const vars = [...new Set(clone.outerHTML.match(/--[\w-]+/g) ?? [])];
  clone.setAttribute('style', vars.map(v => `${v}:${cs.getPropertyValue(v).trim()}`).join(';'));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(clone);
}
