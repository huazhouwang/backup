/**
 * Style renders for the agent (issue 195): render the design in a style from a few automatic shots (the aerial, the street and
 * the largest rooms). Runs in the browser, which draws the passes from the 3D model; the images are kept with the design, shown
 * in the chat and in the styles panel, and cost free credits.
 */
import { customStyle, defineRead, STYLE_PRESETS, type CapabilityContext, type Project, type StylePreset } from '@opensu/core';
import { z } from 'zod';
import { m } from '@/lib/i18n';
import type { RenderInfo } from '@/shared/renders';

export interface RendersHost {
  render(project: Project, style: StylePreset, shots: number): Promise<RenderInfo[]>;
}

const host = (ctx: CapabilityContext) => {
  const h = ctx.host?.renders as RendersHost | undefined;
  if (!h) throw new Error(m.server_err_view_needs_browser());
  return h;
};

const ids = STYLE_PRESETS.map(s => s.id) as [string, ...string[]];

export const renderStyleCap = defineRead({
  name: 'render_style',
  title: 'Render in a style',
  kind: 'view',
  permission: 'read',
  runtime: 'browser',
  description: [
    'Render the design as photographs in a style: the whole house from above and from the street, then the largest rooms, ',
    'each image made by an image model from the 3D model, so walls, doors and windows stay where they are. ',
    `Presets: ${STYLE_PRESETS.map(s => `${s.id} (${s.name.en} / ${s.name.zh})`).join(', ')}; or describe a style in words (English works best). `,
    'Each image costs free credits; the owner sees them in the chat and in the Styles panel, with before/after. ',
    'Use it when the owner asks to see the house in a style; one style per call.',
  ].join(''),
  input: z.object({
    style: z.enum(ids).optional().describe('A preset style'),
    words: z.string().min(2).max(300).optional().describe('A style in words, instead of a preset'),
    shots: z.number().int().min(1).max(6).default(4).describe('How many images: the aerial, the street, then rooms by size'),
  }),
  run: async (i, ctx) => {
    const style = i.words ? customStyle(i.words) : STYLE_PRESETS.find(s => s.id === (i.style ?? ids[0]))!;
    const made = await host(ctx).render(ctx.session.project, style, i.shots);
    return { style: style.id, images: made.map(r => ({ id: r.id, shot: r.shot_name })) };
  },
});

export const RENDER_CAPABILITIES = [renderStyleCap];
