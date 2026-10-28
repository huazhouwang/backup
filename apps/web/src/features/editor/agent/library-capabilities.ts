/**
 * Look libraries for the agent: list them, read a look to copy it into the design (look_import), and save a look of the design
 * to a library; save the design's own widgets (tools, effects) to a widget library. Run in the browser, which calls the API as the user; the server only uses the definitions.
 */
import { DESIGN_WIDGETS, designLookOf, libraryLookOf, defineRead, type CapabilityContext, type ParamValue, type WidgetDef } from '@opensu/core';
import { z } from 'zod';
import { m, uiName } from '@/lib/i18n';
import type { LibraryDetail, LibraryLookInput, LibrarySummary } from '@/shared/looks';

/** Implemented by the editor and injected into CapabilityContext.host.libraries */
export interface LibrariesHost {
  list(): Promise<LibrarySummary[]>;
  get(id: string): Promise<LibraryDetail>;
  save(library: string, look: LibraryLookInput, lookId?: string): Promise<{ look: string; version: string }>;
}

const host = (ctx: CapabilityContext) => {
  const h = ctx.host?.libraries as LibrariesHost | undefined;
  if (!h) throw new Error(m.server_err_view_needs_browser());
  return h;
};

export const libraryList = defineRead({
  name: 'library_list',
  title: 'List look libraries',
  kind: 'query',
  permission: 'read',
  runtime: 'browser',
  description:
    'List the look libraries the user can use (their own and shared ones), each with its looks (ID, name, what they draw, version). Copy one into the design with library_look_get then look_import.',
  input: z.object({}),
  run: async (_, ctx) => {
    const libs = await host(ctx).list();
    return Promise.all(
      libs.map(async l => ({
        id: l.id,
        name: l.name,
        role: l.role,
        looks: Object.entries((await host(ctx).get(l.id)).library.looks).map(([id, k]) => ({
          look: id,
          name: uiName(k.name),
          for: k.for,
          version: k.version,
          params: Object.keys(k.params ?? {}),
        })),
      })),
    );
  },
});

export const libraryLookGet = defineRead({
  name: 'library_look_get',
  title: 'Read a look in a library',
  kind: 'query',
  permission: 'read',
  runtime: 'browser',
  description:
    'Read a look in a library (its recipe with the materials it uses, and the furniture type it brings), to pass to look_import as is: { name, for, recipe, types?, source }.',
  input: z.object({ library: z.string().describe('Library ID'), look: z.string().describe('Look ID in the library') }),
  run: async (i, ctx) => {
    const lib = (await host(ctx).get(i.library)).library;
    if (!lib.looks[i.look]) throw new Error(m.agent_err_look_not_found({ look: i.look }));
    return designLookOf(lib, i.look, ctx.session.project.language);
  },
});

export const librarySave = defineRead({
  name: 'library_save',
  title: 'Save a look to a library',
  kind: 'relation',
  permission: 'reversible',
  runtime: 'browser',
  description:
    'Save a look of the design to a look library the user can edit (a look copied from that library gets a new version there). Then call look_import with the returned source and replace set to the design look, so the design knows where its copy lives.',
  input: z.object({ look: z.string().describe('ID or name of a look of the design'), library: z.string().describe('Library ID') }),
  run: async (i, ctx) => {
    const p = ctx.session.project,
      looks = p.library.looks ?? {};
    const id = looks[i.look] ? i.look : Object.entries(looks).find(([, l]) => l.name === i.look)?.[0];
    if (!id) throw new Error(m.agent_err_look_not_found({ look: i.look }));
    const look = looks[id];
    const r = await host(ctx).save(i.library, libraryLookOf(p, look), look.source?.library === i.library ? look.source.look : undefined);
    return { designLook: id, source: { library: i.library, look: r.look, version: r.version } };
  },
});

/** Saving the design's own widgets for reuse (issue 204), through the API as the user */
export interface WidgetsHost {
  /** Into a widget library the user can edit (by default their first, else a new one); returns where it went */
  save(id: string, def: WidgetDef, library?: string): Promise<{ library: string; libraryName: string; widget: string; version: string }>;
  /** Installed for the user themselves: drawn in every design they open */
  installForMe(library: string, widget: string, params: Record<string, ParamValue>, language: 'zh' | 'en'): Promise<void>;
}

export const widgetSave = defineRead({
  name: 'widget_save',
  title: 'Save a widget for reuse',
  kind: 'relation',
  permission: 'reversible',
  runtime: 'browser',
  description:
    "Save one of the design's own widgets (one written with widget_create: a tool or an effect) into a widget library the user can edit, so it can be installed in other designs and shared. A changed widget gets a new version there. By default it goes to the user's first editable widget library (one is created when they have none). forMe also installs it for the user themselves, so it shows in every design they open, with the parameters it has here.",
  input: z.object({
    widget: z.string().describe("The design's own widget: its id in the design library (design) or the id of its installed copy"),
    library: z.string().optional().describe('A widget library ID the user can edit; default: their first'),
    forMe: z.boolean().optional().describe('Also show it in every design the user opens'),
  }),
  run: async (i, ctx) => {
    const p = ctx.session.project;
    const own = p.library.widgets ?? {};
    const installed = p.widgets.find(w => w.id === i.widget || w.name === i.widget);
    const id = own[i.widget] ? i.widget : installed?.widget.library === DESIGN_WIDGETS ? installed.widget.id : undefined;
    if (!id || !own[id]) throw new Error(m.agent_err_widget_not_own({ widget: i.widget }));
    const h = ctx.host?.widgets as WidgetsHost | undefined;
    if (!h) throw new Error(m.server_err_view_needs_browser());
    const saved = await h.save(id, own[id], i.library);
    if (i.forMe) {
      const params = p.widgets.find(w => w.widget.library === DESIGN_WIDGETS && w.widget.id === id)?.params ?? {};
      await h.installForMe(saved.library, saved.widget, params, p.language);
    }
    return { ...saved, forMe: !!i.forMe };
  },
});

export const LIBRARY_CAPABILITIES = [libraryList, libraryLookGet, librarySave, widgetSave];
