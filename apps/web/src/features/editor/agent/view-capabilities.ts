/**
 * View capabilities that run only in the browser: switch view, focus, screenshot.
 * View state is data too: camera, level, selection and change highlights are all readable/writable. The server only uses their definitions to build tool descriptions.
 */
import { defineRead, findObject, resolveLevel, type CapabilityContext } from '@plinth/core';
import { z } from 'zod';
import { m } from '@/lib/i18n';
import { COMMENT_STATUSES, type CommentRow, type CommentStatus } from '@/shared/comments';

export interface ViewState {
  mode: '2d' | '3d';
  level: string;
  selection: string[];
  highlight: string[];
  camera?: { position: [number, number, number]; target: [number, number, number] } | null;
  /** cutaway: 3D shows only the current level and those below it, instead of the whole house */
  layers: { furniture: boolean; dimensions: boolean; labels: boolean; cutaway: boolean };
}

/** Implemented by the canvas and injected into CapabilityContext.host.view */
export interface ViewHost {
  get(): ViewState;
  set(patch: Partial<ViewState>): ViewState;
  focus(ids: string[], highlight: boolean): ViewState;
  screenshot(): Promise<{ dataUrl: string; width: number; height: number }>;
}

const host = (ctx: CapabilityContext) => {
  const v = ctx.host?.view as ViewHost | undefined;
  if (!v) throw new Error(m.server_err_view_needs_browser());
  return v;
};

export const viewGet = defineRead({
  name: 'view_get',
  title: 'Read view',
  kind: 'view',
  permission: 'read',
  runtime: 'browser',
  description:
    'Read the current view: plan or 3D, current level, selected objects, recently changed objects, camera, layer toggles. When the user says "this wall" or "here", read the selected objects first.',
  input: z.object({}),
  run: (_, ctx) => {
    const s = host(ctx).get();
    const p = ctx.session.project;
    return { ...s, selection: s.selection.map(id => ({ id, name: findObject(p, id)?.name ?? id })) };
  },
});

export const viewSet = defineRead({
  name: 'view_set',
  title: 'Change view',
  kind: 'view',
  permission: 'read',
  runtime: 'browser',
  description:
    'Switch between plan and 3D, change level, and toggle the furniture, dimensions and labels layers, and the 3D cutaway (only the current level and below; off shows the whole house).',
  input: z.object({
    mode: z.enum(['2d', '3d']).optional(),
    level: z.string().optional().describe('Level ID or name'),
    layers: z
      .object({
        furniture: z.boolean().optional(),
        dimensions: z.boolean().optional(),
        labels: z.boolean().optional(),
        cutaway: z.boolean().optional().describe('3D: hide the levels above the current one'),
      })
      .optional(),
  }),
  run: (i, ctx) => {
    const v = host(ctx);
    // Throws not-found (listing the existing levels) instead of silently keeping the current level
    const lv = i.level ? resolveLevel(ctx.session.project, i.level).id : undefined;
    return v.set({
      ...(i.mode ? { mode: i.mode } : {}),
      ...(lv ? { level: lv } : {}),
      ...(i.layers ? { layers: { ...v.get().layers, ...i.layers } as ViewState['layers'] } : {}),
    });
  },
});

export const viewFocus = defineRead({
  name: 'view_focus',
  title: 'Show you',
  kind: 'view',
  permission: 'read',
  runtime: 'browser',
  description:
    'Turn the camera to these objects and make them pulse on the drawing (switches to their level automatically). Use it after a change to show the homeowner what changed.',
  input: z.object({ ids: z.array(z.string()).min(1).describe('Object IDs'), highlight: z.boolean().default(true) }),
  run: (i, ctx) => host(ctx).focus(i.ids, i.highlight),
});

export const viewScreenshot = defineRead({
  name: 'view_screenshot',
  title: 'Screenshot',
  kind: 'verify',
  permission: 'read',
  runtime: 'browser',
  description: 'Take a screenshot of the current view to show the homeowner (the image appears in the chat).',
  input: z.object({}),
  run: async (_, ctx) => {
    const s = await host(ctx).screenshot();
    return { shown: true, width: s.width, height: s.height, image: s.dataUrl };
  },
});

/** Comments: comments in a project are attached to objects; the agent can read them, reply, and mark them pending-confirm or resolved */
export interface CommentsHost {
  list(): Promise<CommentRow[]>;
  reply(parentId: string, body: string, status?: CommentStatus): Promise<void>;
}

const comments = (ctx: CapabilityContext) => {
  const c = ctx.host?.comments as CommentsHost | undefined;
  if (!c) throw new Error(m.server_err_view_needs_browser());
  return c;
};

export const commentsList = defineRead({
  name: 'comments_list',
  title: 'Read comments',
  kind: 'query',
  permission: 'read',
  runtime: 'browser',
  description: 'List the comments in the project (target object, author, status, replies). By default only unresolved ones.',
  input: z.object({ all: z.boolean().default(false) }),
  run: async (i, ctx) => {
    const rows = await comments(ctx).list();
    const roots = rows.filter(r => !r.parent_id && (i.all || r.status !== 'resolved'));
    return roots.map(r => ({ ...r, replies: rows.filter(x => x.parent_id === r.id).map(x => ({ author: x.author, body: x.body })) }));
  },
});

export const commentReply = defineRead({
  name: 'comment_reply',
  title: 'Reply to comment',
  kind: 'relation',
  permission: 'reversible',
  runtime: 'browser',
  description:
    "Reply to a comment and set its status: use resolved when the change is done; when the homeowner must decide, spell out the options and use pending-confirm (awaiting the homeowner's confirmation). Write the reply in the language the comment thread uses.",
  input: z.object({ comment: z.string().describe('Comment ID'), body: z.string(), status: z.enum(COMMENT_STATUSES) }),
  run: async (i, ctx) => {
    await comments(ctx).reply(i.comment, i.body, i.status);
    return { ok: true };
  },
});

export const VIEW_CAPABILITIES = [viewGet, viewSet, viewFocus, viewScreenshot, commentsList, commentReply];
