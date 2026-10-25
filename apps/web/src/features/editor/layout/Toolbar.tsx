import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, DownloadIcon, EllipsisIcon, ImageIcon, LayoutPanelLeftIcon, Redo2Icon, Share2Icon, Undo2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { roleLabel } from '@/lib/api';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';
import { download } from '@/lib/download';
import { SaveStatus } from './SaveStatus';

/** Layer toggle labels: [show, hide] */
const LAYER_LABELS = {
  furniture: [m.editor_show_furniture, m.editor_hide_furniture],
  labels: [m.editor_show_labels, m.editor_hide_labels],
  dimensions: [m.editor_show_dimensions, m.editor_hide_dimensions],
} as const;

export function Toolbar({ onShare, onExport }: { onShare: () => void; onExport: () => void }) {
  // Subscribing to the project also keeps undo/redo availability current
  const project = useEditor(s => s.project);
  const view = useEditor(s => s.view);
  const setView = useEditor(s => s.setView);
  const role = useEditor(s => s.role);
  const undo = useEditor(s => s.undo);
  const redo = useEditor(s => s.redo);
  const canEdit = useEditor(s => s.canEdit());
  const session = useEditor(s => s.session);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 1)], { type: 'application/json' });
    void download(URL.createObjectURL(blob), `${project.name}.json`);
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
      <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link to="/projects" />} aria-label={m.editor_back_to_projects()}>
        <ArrowLeftIcon />
      </Button>
      <div className="min-w-0 flex-1 md:flex-none">
        <p className="truncate text-sm font-medium">{project.name}</p>
      </div>
      <SaveStatus />
      <div className="flex-1 max-md:hidden" />
      {canEdit && (
        <div className="flex max-sm:hidden">
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={undo} disabled={!session.canUndo} aria-label={m.editor_undo()} />}>
              <Undo2Icon />
            </TooltipTrigger>
            <TooltipContent>{m.editor_undo_shortcut()}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={redo} disabled={!session.canRedo} aria-label={m.editor_redo()} />}>
              <Redo2Icon />
            </TooltipTrigger>
            <TooltipContent>{m.editor_redo_shortcut()}</TooltipContent>
          </Tooltip>
        </div>
      )}
      <Button size="sm" variant="outline" onClick={onShare}>
        <Share2Icon />
        <span className="max-sm:hidden">{role === 'owner' ? m.editor_share() : roleLabel(role)}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={m.editor_more()} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onExport}>
            <ImageIcon /> {m.editor_export_image()}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportJson}>
            <DownloadIcon /> {m.editor_download_json()}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {(['furniture', 'labels', 'dimensions'] as const).map(k => (
            <DropdownMenuItem key={k} onClick={() => setView({ layers: { ...view.layers, [k]: !view.layers[k] } })}>
              <LayoutPanelLeftIcon /> {LAYER_LABELS[k][view.layers[k] ? 1 : 0]()}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
