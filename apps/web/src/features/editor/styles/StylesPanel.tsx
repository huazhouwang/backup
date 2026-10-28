/**
 * Styles (issue 195): render the design in a style (a preset, or one described in words) from a few automatic shots, and the
 * images made so far, by style. Each image opens over the 3D view it was made from, to compare.
 */
import { customStyle, STYLE_PRESETS, type StylePreset } from '@opensu/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { RenderGallery } from '@/features/renders/RenderGallery';
import { listRenders, renderConfig, renderStyle, shotsFor, useRenderJob } from '@/features/renders/renders';
import { m, uiName } from '@/lib/i18n';
import { can } from '@/shared/roles';
import { useEditor } from '../store';

/** A preset's colours as a strip */
export function Palette({ style }: { style: StylePreset }) {
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-sm" aria-hidden>
      {style.palette.map(c => (
        <span key={c} className="flex-1" style={{ background: c }} />
      ))}
    </span>
  );
}

export function StylesPanel() {
  const projectId = useEditor(s => s.projectId);
  const project = useEditor(s => s.project);
  const role = useEditor(s => s.role);
  const readOnly = useEditor(s => s.readOnlyVersion != null);
  const editable = can(role, 'editor') && !readOnly;
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ['render-config'], queryFn: renderConfig });
  const renders = useQuery({ queryKey: ['renders', projectId], queryFn: () => listRenders(projectId) });
  const job = useRenderJob();
  const [picked, setPicked] = useState(STYLE_PRESETS[0].id);
  const [words, setWords] = useState('');
  const [error, setError] = useState<string | null>(null);
  const shots = shotsFor(project);
  const style = words.trim() ? customStyle(words.trim()) : STYLE_PRESETS.find(s => s.id === picked)!;

  const start = async () => {
    setError(null);
    try {
      await renderStyle(projectId, project, style, shots, () => void qc.invalidateQueries({ queryKey: ['renders', projectId] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      void qc.invalidateQueries({ queryKey: ['credits'] });
    }
  };

  return (
    <div className="flex flex-col gap-4 p-3">
      {config.data?.placeholder && (
        <Alert>
          <AlertTitle>{m.render_placeholder_title()}</AlertTitle>
          <AlertDescription>{m.render_placeholder_description()}</AlertDescription>
        </Alert>
      )}
      {editable && (
        <section className="flex flex-col gap-3" aria-label={m.render_pick_aria()}>
          <ToggleGroup
            value={words.trim() ? [] : [picked]}
            onValueChange={v => {
              if (v[0]) setPicked(v[0] as string);
              setWords('');
            }}
            className="grid w-full grid-cols-3 gap-2"
            spacing={2}
          >
            {STYLE_PRESETS.map(s => (
              <ToggleGroupItem key={s.id} value={s.id} variant="outline" className="h-auto flex-col items-stretch gap-1.5 px-2 py-2">
                <span className="text-sm">{uiName(s.name)}</span>
                <Palette style={s} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Input value={words} onChange={e => setWords(e.target.value)} placeholder={m.render_custom_placeholder()} aria-label={m.render_custom_aria()} />
          <Button disabled={!!job || shots.length === 0} onClick={() => void start()}>
            {job ? (
              <>
                <Spinner />
                {m.render_running({ done: job.done, total: job.total })}
              </>
            ) : (
              m.render_start({ style: uiName(style.name), count: shots.length, credits: shots.length * (config.data?.credits ?? 0) })
            )}
          </Button>
          {shots.length === 0 && <p className="text-xs text-muted-foreground">{m.render_nothing_to_shoot()}</p>}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </section>
      )}
      <RenderGallery projectId={projectId} renders={renders.data ?? []} editable={editable} />
    </div>
  );
}
