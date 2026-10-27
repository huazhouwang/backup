/**
 * The user's own widgets ("for me", packages/core/src/widgets/mine.ts) in the editor: read from their settings, changed there
 * (shown at once, stored in the background, put back on failure), drawn in every design they open. Not part of the design, so
 * not edits of it: no undo, no history, nobody else sees them.
 */
import { configureMyWidget, isMyWidget, type MyWidgets, type ParamValue } from '@opensu/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useMe } from '@/lib/query';
import { useRun } from '../panels/common';

const EMPTY: MyWidgets = { widgets: [] };

export function useMyWidgets() {
  const me = useMe();
  const userId = me.data?.user?.id;
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['my-widgets', userId], enabled: !!userId, retry: false, queryFn: () => api<MyWidgets>('/me/widgets') });
  const change = useCallback(
    async (fn: (set: MyWidgets) => MyWidgets) => {
      const key = ['my-widgets', userId];
      const before = qc.getQueryData<MyWidgets>(key) ?? EMPTY;
      let next: MyWidgets;
      try {
        next = fn(before);
      } catch (e) {
        toast.error((e as Error).message);
        return;
      }
      qc.setQueryData(key, next);
      try {
        await api('/me/widgets', { method: 'PUT', json: next });
      } catch (e) {
        qc.setQueryData(key, before);
        toast.error((e as Error).message);
      }
    },
    [qc, userId],
  );
  return { set: query.data ?? EMPTY, change, ready: !!userId };
}

/** Making a dragged handle's params stick: on the user's own widget in their settings, else on the design's through its capability */
export function useWidgetCommit() {
  const run = useRun();
  const { change } = useMyWidgets();
  return useCallback(
    (widget: string, params: Record<string, ParamValue>) =>
      isMyWidget(widget) ? change(set => configureMyWidget(set, widget, { params })) : run('widget_configure', { widget, params }),
    [run, change],
  );
}
