/** Widget libraries from the API, as widget library files (packages/core/src/widgets/format.ts) */
import type { WidgetDef, WidgetLibrary } from '@opensu/core';
import type { WidgetLibraryDetail, WidgetLibraryFile, WidgetLibrarySummary } from '@/shared/widgets';
import { api } from './api';

export const listWidgetLibraries = () => api<WidgetLibrarySummary[]>('/widget-libraries');
export const widgetLibraryFiles = () => api<WidgetLibraryFile[]>('/widget-libraries/files');
export const getWidgetLibrary = (id: string) => api<WidgetLibraryDetail>(`/widget-libraries/${id}`);
export const createWidgetLibrary = (name: string) => api<{ id: string }>('/widget-libraries', { method: 'POST', json: { name } });
export const importWidgetLibrary = (file: unknown) => api<{ id: string }>('/widget-libraries/import', { method: 'POST', json: { file } });

/** Save a widget into a library (a changed one gets a new version) */
export const saveWidget = (library: string, widget: string, def: WidgetDef) =>
  api<{ widget: string; version: string }>(`/widget-libraries/${library}/widgets/${widget}`, { method: 'PUT', json: { def } });

/** Publish a canvas module as a wheel in a library (a changed source gets a new version) */
export const publishCanvasModule = (library: string, module: string, m: { name: string; description?: string; source: string }) =>
  api<{ library: string; module: string; version: number }>(`/widget-libraries/${library}/canvas-modules/${module}`, { method: 'PUT', json: m });

/** Download a library as a file (`<id>.widgetlib.json`) */
export function downloadWidgetLibrary(lib: WidgetLibrary) {
  const { $schema: _s, ...file } = lib;
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${lib.id}.widgetlib.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
