/**
 * Look libraries for the agent: list them, read a look to copy it into the design (look_import), and save a look of the design
 * to a library. Run in the browser, which calls the API as the user; the server only uses the definitions.
 */
import { designLookOf, libraryLookOf, defineRead, type CapabilityContext } from '@plinth/core';
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

export const LIBRARY_CAPABILITIES = [libraryList, libraryLookGet, librarySave];
