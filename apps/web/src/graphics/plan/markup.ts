import { renderToStaticMarkup } from 'react-dom/server';

/** Render React SVG to markup, with theme variables replaced by their values (an SVG drawn as an image can't read them) */
export function markup(el: React.ReactElement, doc: Document) {
  const html = renderToStaticMarkup(el);
  const cs = doc.defaultView!.getComputedStyle(doc.documentElement);
  return html.replace(/var\((--[\w-]+)\)/g, (_, v: string) => cs.getPropertyValue(v).trim().replace(/"/g, "'"));
}
