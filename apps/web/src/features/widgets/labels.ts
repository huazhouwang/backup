import type { WidgetDef } from '@opensu/core';
import { m } from '@/lib/i18n';

/** What a widget may do, as the UI names it */
export const permissionLabel = (p: WidgetDef['permissions'][number]) => (p === 'draw' ? m.widget_permission_draw() : p);
