/**
 * A widget library's page, the same for every library: what its file says about it, then a card per widget with a preview of it
 * at work on the sample house, its description, version, what it may do and its parameters. Export downloads the file; the owner and editors manage it from the sheet.
 */
import type { LibraryOrigin, WidgetDef } from '@opensu/core';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ArrowLeftIcon, CopyIcon, DownloadIcon, SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { LibraryBadge } from '@/features/looks/LibraryBadge';
import { LibraryAdmin } from '@/features/looks/LibraryManage';
import { SiteFooter, SiteHeader } from '@/features/site/SiteHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { m, uiName } from '@/lib/i18n';
import { useMe } from '@/lib/query';
import { createWidgetLibrary, downloadWidgetLibrary, getWidgetLibrary, listWidgetLibraries, saveWidget } from '@/lib/widget-libraries';
import type { WidgetLibraryDetail } from '@/shared/widgets';
import { permissionLabel } from './labels';
import { WidgetPreview } from './WidgetPreview';

const route = getRouteApi('/widgets/$libraryId');

export function WidgetLibraryPage() {
  const { libraryId } = route.useParams();
  const detail = useQuery({ queryKey: ['widget-library', libraryId], queryFn: () => getWidgetLibrary(libraryId) });
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6">
        <Button variant="link" size="sm" className="h-auto px-0" nativeButton={false} render={<Link to="/widgets" />}>
          <ArrowLeftIcon /> {m.widget_libraries_back()}
        </Button>
        {detail.isLoading ? (
          <Skeleton className="h-40" />
        ) : !detail.data ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{detail.error?.message ?? m.server_err_widget_library_not_found()}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <WidgetLibrary detail={detail.data} />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function WidgetLibrary({ detail }: { detail: WidgetLibraryDetail }) {
  const lib = detail.library;
  const widgets = Object.entries(lib.widgets);
  const modules = Object.entries(lib.canvasModules ?? {});
  // Who wrote it decides its realm in the sandbox, for the previews
  const owner = detail.members.find(x => x.role === 'owner')?.user_id ?? lib.id;
  const origin: LibraryOrigin = detail.builtin ? { origin: 'builtin', id: lib.id } : { origin: 'team', owner, id: lib.id };
  const facts = [
    `v${lib.version}`,
    lib.author && m.libraries_by({ author: lib.author }),
    lib.license && m.libraries_license({ license: lib.license }),
    m.widget_libraries_count({ count: widgets.length }),
  ].filter(Boolean);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{uiName(lib.name)}</h1>
            <LibraryBadge lib={detail} />
          </div>
          {lib.description && <p className="max-w-2xl text-sm text-muted-foreground">{uiName(lib.description)}</p>}
          <p className="text-xs text-muted-foreground">{facts.join(' · ')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadWidgetLibrary(lib)}>
            <DownloadIcon /> {m.libraries_export()}
          </Button>
          {!detail.builtin && (
            <Sheet>
              <SheetTrigger render={<Button size="sm" variant="outline" />}>
                <SettingsIcon /> {m.libraries_manage()}
              </SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>{uiName(lib.name)}</SheetTitle>
                </SheetHeader>
                <div className="px-4 pb-4">
                  <LibraryAdmin
                    kind="widgets"
                    lib={{
                      id: lib.id,
                      name: uiName(lib.name),
                      role: detail.role,
                      members: detail.members,
                      items: widgets.map(([id, w]) => ({ id, name: uiName(w.name), version: w.version })),
                    }}
                  />
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
      {widgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.widget_libraries_empty()}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {widgets.map(([id, w]) => (
            <li key={id}>
              <WidgetCard id={id} def={w} origin={origin} remix={detail.role !== 'owner'} />
            </li>
          ))}
        </ul>
      )}
      {modules.length > 0 && (
        <section className="space-y-3" data-canvas-modules>
          <h2 className="text-base font-semibold">{m.widget_libraries_canvas_modules()}</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {modules.map(([id, c]) => (
              <li key={id}>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>{c.name}</CardTitle>
                    <CardDescription>
                      <code>{id}</code> · {m.widget_libraries_canvas_module_version({ version: c.version, size: (c.source.length / 1024).toFixed(1) })}
                    </CardDescription>
                  </CardHeader>
                  {c.description && <CardContent className="text-sm text-muted-foreground">{c.description}</CardContent>}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Copy a widget into the user's own widget library (one made when they have none), to change it there or install it anywhere */
async function remixWidget(id: string, def: WidgetDef) {
  const own = (await listWidgetLibraries()).find(l => l.role === 'owner' && !l.builtin);
  const lib = own ?? { id: (await createWidgetLibrary(m.widgets_default_library())).id, name: m.widgets_default_library() };
  const r = await saveWidget(lib.id, id, def);
  toast.success(m.widgets_saved({ library: lib.name, version: r.version }));
}

function WidgetCard({ id, def, origin, remix }: { id: string; def: WidgetDef; origin: LibraryOrigin; remix: boolean }) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const params = Object.entries(def.params ?? {});
  return (
    <Card size="sm" data-widget-card={id}>
      <CardHeader>
        <CardTitle>{uiName(def.name)}</CardTitle>
        <CardAction className="flex items-center gap-2">
          <Badge variant="secondary">v{def.version}</Badge>
          {remix && me.data?.user && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                remixWidget(id, def)
                  .catch(e => toast.error((e as Error).message))
                  .finally(() => setBusy(false));
              }}
            >
              <CopyIcon /> {m.widget_remix()}
            </Button>
          )}
        </CardAction>
        <CardDescription className="whitespace-pre-line">{def.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <WidgetPreview origin={origin} id={id} def={def} />
        <p className="text-xs text-muted-foreground">
          {m.widget_libraries_permissions({ list: def.permissions.map(permissionLabel).join(m.panels_list_separator()) })}
        </p>
        {params.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.widget_libraries_param()}</TableHead>
                <TableHead>{m.widget_libraries_param_default()}</TableHead>
                <TableHead>{m.widget_libraries_param_range()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {params.map(([k, d]) => (
                <TableRow key={k}>
                  <TableCell>{d.title ? uiName(d.title) : k}</TableCell>
                  <TableCell className="font-mono text-xs">{JSON.stringify(d.default)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {d.enum ? d.enum.map(v => JSON.stringify(v)).join(' / ') : [d.minimum ?? '', d.maximum ?? ''].join(' – ').replace(/^ – $/, '')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
