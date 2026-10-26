/**
 * The person's own canvas modules (issue 171): modules they add for themselves, kept in their settings (/me/canvas) and run in the
 * sample-room page of every design they open. Not part of any design, so not edits of one: no undo, no history, nobody else sees
 * them. Changes show at once and are stored in the background; a failed store puts the old ones back.
 */
import type { CanvasPage } from '@plinth/core';
import { useQuery } from '@tanstack/react-query';
import { api, type Me } from '@/lib/api';
import { m } from '@/lib/i18n';
import { queryClient, useMe } from '@/lib/query';

const EMPTY: CanvasPage = { modules: [] };
const userId = () => queryClient.getQueryData<Me>(['me'])?.user?.id;
const keyOf = (id: string | undefined) => ['my-canvas', id];

/** The person's own modules, as the sample room runs them (empty until loaded, or when signed out) */
export function useMyCanvas() {
  const id = useMe().data?.user?.id;
  return useQuery({ queryKey: keyOf(id), enabled: !!id, retry: false, queryFn: () => api<CanvasPage>('/me/canvas') }).data ?? EMPTY;
}

/** The person's own modules now, loading them if need be */
export async function myCanvas(): Promise<CanvasPage> {
  const id = userId();
  if (!id) throw new Error(m.editor_my_canvas_signed_out());
  return queryClient.fetchQuery({ queryKey: keyOf(id), queryFn: () => api<CanvasPage>('/me/canvas') });
}

/** Change the person's own modules: shown at once, then stored; throws (and puts them back) when storing fails */
export async function changeMyCanvas(fn: (page: CanvasPage) => CanvasPage): Promise<CanvasPage> {
  const before = await myCanvas();
  const next = fn(before);
  const key = keyOf(userId());
  queryClient.setQueryData(key, next);
  try {
    await api('/me/canvas', { method: 'PUT', json: next });
  } catch (e) {
    queryClient.setQueryData(key, before);
    throw e;
  }
  return next;
}
