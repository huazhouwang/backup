/**
 * Looking at a look before (or after) adding it: the agent's self-check. Runs in the browser, which draws the still; the server
 * only uses the definition to describe the tool.
 */
import { checkRecipe, defineRead, inspectRecipe, normalizeRecipe, targetSize, type CapabilityContext, type Recipe } from '@plinth/core';
import { z } from 'zod';
import { m } from '@/lib/i18n';

/** Implemented by the editor and injected into CapabilityContext.host.looks */
export interface LooksHost {
  preview(recipe: Recipe, size: { w: number; d: number; h: number }): Promise<string>;
}

export const lookPreview = defineRead({
  name: 'look_preview',
  title: 'Preview a look',
  kind: 'verify',
  permission: 'read',
  runtime: 'browser',
  description: [
    'Check a look before or after adding it: build a recipe (or a look of the design) at a size, show the homeowner a still from three sides in the chat,',
    'and get back what it builds: its extent, parts sticking out of the footprint or above the height, parts floating in the air, and rough character drawings',
    '(top, front, side; # is filled). Fix what looks wrong, then add or update the look. Give recipe (format in look_add) or look (ID or name);',
    "the size defaults to the target's (a furniture type's size, a typical door or window).",
  ].join(' '),
  input: z.object({
    recipe: z.unknown().optional(),
    look: z.string().optional().describe('Look ID or name'),
    target: z.string().optional().describe("Target whose size to use, e.g. 'furniture:dining'"),
    size: z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() }).optional(),
  }),
  run: async (i, ctx: CapabilityContext) => {
    const p = ctx.session.project;
    const looks = p.library.looks ?? {};
    const look = i.look ? (looks[i.look] ?? Object.values(looks).find(l => l.name === i.look)) : undefined;
    if (i.look && !look) throw new Error(m.agent_err_look_not_found({ look: i.look }));
    const recipe = normalizeRecipe(i.recipe ?? look?.recipe) as Recipe | undefined;
    if (!recipe) throw new Error(m.agent_err_look_preview_input());
    const size = i.size ?? targetSize(p, i.target ?? look?.for[0] ?? 'furniture:');
    const problems = await checkRecipe(recipe, size);
    if (problems.length) return { ok: false, problems };
    const host = ctx.host?.looks as LooksHost | undefined;
    if (!host) throw new Error(m.server_err_view_needs_browser());
    return { size, report: await inspectRecipe(recipe, size), image: await host.preview(recipe, size) };
  },
});

export const LOOK_CAPABILITIES = [lookPreview];
