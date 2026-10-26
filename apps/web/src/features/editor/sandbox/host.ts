/**
 * The canvas page as capabilities reach it (CapabilityContext.host.canvas): trying a module in the open sample-room page before
 * it is saved, a design's or the person's own. With no page open, nothing is tried and the module is saved as it is.
 */
import type { CanvasHost } from '@plinth/core';
import type { ModuleScope } from '@/wheels/protocol';

type Trier = (scope: ModuleScope, id: string, source: string) => Promise<{ ok: true; drawn?: unknown } | { ok: false; error: string }>;
let page: Trier | null = null;

/** Called by the open page (SandboxCanvas) with how to try a module there; null when it goes */
export const setCanvasPage = (t: Trier | null) => (page = t);

/** Try a module in the open page, if there is one */
export async function tryModule(
  scope: ModuleScope,
  id: string,
  source: string,
): Promise<{ ok: true; tried: boolean; drawn?: unknown } | { ok: false; error: string }> {
  if (!page) return { ok: true, tried: false };
  const r = await page(scope, id, source);
  return r.ok ? { ok: true, tried: true, ...(r.drawn ? { drawn: r.drawn } : {}) } : r;
}

export const canvasHost: CanvasHost = { tryModule: (id, source) => tryModule('design', id, source) };
