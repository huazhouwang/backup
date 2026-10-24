/** Saved versions: view one read-only, go back to the latest, or restore it */
import { useQuery } from '@tanstack/react-query';
import { EyeIcon, HistoryIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { fmtTime } from '@/lib/query';
import { can } from '@/shared/roles';
import { useEditor } from '../store';

export function VersionsPanel() {
  const projectId = useEditor(s => s.projectId);
  const version = useEditor(s => s.version);
  const viewing = useEditor(s => s.readOnlyVersion);
  const loadVersion = useEditor(s => s.loadVersion);
  const restoreVersion = useEditor(s => s.restoreVersion);
  const canEdit = useEditor(s => can(s.role, 'editor'));
  const { data = [] } = useQuery({
    queryKey: ['versions', projectId, version],
    queryFn: () => api<{ version: number; summary: string | null; created_at: number; author: string | null }[]>(`/projects/${projectId}/versions`),
  });

  const restore = async (v: number) => {
    await restoreVersion(v);
    toast.success(m.panels_restored({ version: v }));
  };

  return (
    <div className="p-3">
      {viewing != null && (
        <Alert className="mb-3">
          <EyeIcon />
          <AlertTitle>{m.panels_viewing_version({ version: viewing })}</AlertTitle>
          <AlertDescription>
            <div className="mt-1 flex gap-2">
              {canEdit && (
                <Button size="sm" onClick={() => restore(viewing)}>
                  {m.panels_restore_this()}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => loadVersion(null)}>
                {m.panels_back_to_latest()}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <ItemGroup className="gap-1">
        {data.map(v => (
          <Item
            key={v.version}
            size="xs"
            variant={viewing === v.version ? 'muted' : 'default'}
            render={<button type="button" />}
            className="cursor-pointer text-left hover:bg-muted"
            onClick={() => (v.version === version && viewing == null ? null : loadVersion(v.version === version ? null : v.version))}
          >
            <ItemMedia variant="icon">
              <HistoryIcon className="text-muted-foreground" />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="w-full truncate">{v.summary ?? m.panels_version_default_summary()}</ItemTitle>
              <ItemDescription>
                {m.panels_version_number({ version: v.version })} · {v.author || m.panels_someone()} · {fmtTime(v.created_at)}
                {v.version === version ? m.panels_version_latest() : ''}
              </ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </div>
  );
}
