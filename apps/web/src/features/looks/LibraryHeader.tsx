import { DownloadIcon, SettingsIcon } from 'lucide-react';
import { LibraryBadge } from './LibraryBadge';
import { LibraryManage } from './LibraryManage';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { m, uiName } from '@/lib/i18n';
import { downloadLibrary } from '@/lib/libraries';
import type { LibraryDetail } from '@/shared/looks';

export function LibraryHeader({ detail }: { detail: LibraryDetail }) {
  const lib = detail.library;
  const looks = Object.keys(lib.looks).length,
    materials = Object.keys(lib.materials ?? {}).length;
  const facts = [
    `v${lib.version}`,
    lib.author && m.libraries_by({ author: lib.author }),
    lib.license && m.libraries_license({ license: lib.license }),
    m.libraries_count({ count: looks }),
    materials > 0 && m.libraries_materials_count({ count: materials }),
  ].filter(Boolean);
  return (
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
        <Button size="sm" variant="outline" onClick={() => downloadLibrary(lib)}>
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
                <LibraryManage detail={detail} />
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}
