/**
 * A share page's HTML (issue 196): the SPA shell with the link preview (Open Graph and Twitter card) of the published design
 * written into its head, so a link posted in a chat or a feed shows the house's hero render, its name and its size. The page
 * itself then renders in the browser like any other.
 */
import { areaReport } from '@opensu/core';
import { env } from 'cloudflare:workers';
import { m } from '@/lib/i18n';
import { stored } from './content';
import * as repo from './repo';

const attr = (s: string) => s.replace(/[&"<>]/g, ch => `&#${ch.charCodeAt(0)};`);

export async function showcasePage(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const shell = await env.ASSETS.fetch(new Request(new URL('/', url), req));
  const token = url.pathname.split('/')[2] ?? '';
  const s = token && (await repo.getShowcase(token));
  const p = s && (await repo.getProject(s.project_id));
  const v = p && (await repo.getVersion(p.id));
  if (!s || !p || !v) return shell;
  const project = stored(v.content);
  const report = areaReport(project);
  const storeys = project.levels.filter(l => !l.roof).length;
  const title = `${p.name} · OpenSU`;
  const description = m.showcase_preview_description({ storeys, area: Math.round(report.totalGross) });
  const image = new URL(`/api/showcase/${token}/preview`, url).href;
  const tags: [string, string, string][] = [
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'OpenSU'],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', url.href],
    ['property', 'og:image', image],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', image],
    ['name', 'description', description],
  ];
  return new HTMLRewriter()
    .on('title', { element: el => void el.setInnerContent(title) })
    .on('head', {
      element: el => void el.append(tags.map(([k, n, c]) => `<meta ${k}="${attr(n)}" content="${attr(c)}">`).join(''), { html: true }),
    })
    .transform(shell);
}
