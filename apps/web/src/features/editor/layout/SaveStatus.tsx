import { CloudCheckIcon, CloudIcon, LoaderIcon, TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';

export function SaveStatus() {
  const saving = useEditor(s => s.saving);
  const dirty = useEditor(s => s.dirty);
  const version = useEditor(s => s.version);
  const viewing = useEditor(s => s.readOnlyVersion);
  if (viewing != null) return <span className="text-xs text-muted-foreground">{m.editor_viewing_version({ version: viewing })}</span>;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
      {saving ? <LoaderIcon className="size-3.5 animate-spin" /> : dirty ? <CloudIcon className="size-3.5" /> : <CloudCheckIcon className="size-3.5" />}
      <span className="hidden sm:inline">{saving ? m.editor_saving() : dirty ? m.editor_unsaved() : m.editor_saved_version({ version })}</span>
    </span>
  );
}

export function Conflict() {
  const conflict = useEditor(s => s.conflict);
  const resolve = useEditor(s => s.resolveConflict);
  if (!conflict) return null;
  return (
    <Alert className="absolute inset-x-0 top-0 z-20 m-3 w-auto shadow-sm">
      <TriangleAlertIcon />
      <AlertTitle>{m.editor_conflict_title({ version: conflict.version })}</AlertTitle>
      <AlertDescription>
        {m.editor_conflict_question()}
        <div className="mt-1 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => resolve('theirs')}>
            {m.editor_conflict_theirs()}
          </Button>
          <Button size="sm" onClick={() => resolve('mine')}>
            {m.editor_conflict_mine()}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
