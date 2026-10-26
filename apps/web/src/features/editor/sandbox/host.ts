/**
 * The canvas page as capabilities reach it (CapabilityContext.host.canvas): trying a module in the open sample-room page before
 * it is saved. With no page open, nothing is tried and the module is saved as it is.
 */
import type { CanvasHost } from '@plinth/core';

type Trier = (id: string, source: string) => Promise<{ ok: true } | { ok: false; error: string }>;
let page: Trier | null = null;

/** Called by the open page (SandboxCanvas) with how to try a module there; null when it goes */
export const setCanvasPage = (t: Trier | null) => (page = t);

export const canvasHost: CanvasHost = {
  async tryModule(id, source) {
    if (!page) return { ok: true, tried: false };
    const r = await page(id, source);
    return r.ok ? { ok: true, tried: true } : r;
  },
};
