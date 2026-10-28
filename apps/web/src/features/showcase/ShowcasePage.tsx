/**
 * A published house (issue 196): where a design becomes a post. The hero render over the model it came from (before/after), the
 * styles made, the house in 3D and its plan, storeys and area in one line; images to download sized for where people post; and
 * the two ways in: remix this house into a design of your own, or design your own from scratch.
 */
import { areaReport, type Project } from '@opensu/core';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { DownloadIcon, LoaderIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { BeforeAfter } from '@/features/renders/BeforeAfter';
import { byStyle } from '@/features/renders/RenderGallery';
import { PlanPreview } from '@/features/site/PlanPreview';
import { SiteFooter, SiteHeader } from '@/features/site/SiteHeader';
import { ensureGuest, startTrial } from '@/features/site/trial';
import { api } from '@/lib/api';
import { track } from '@/lib/events';
import { m } from '@/lib/i18n';
import { renderImageUrl, type RenderInfo } from '@/shared/renders';
import { downloadExport, type ExportRatio } from './exports';
import { HouseViewer } from './HouseViewer';

const route = getRouteApi('/h/$token');

interface Showcase {
  name: string;
  project: Project;
  renders: RenderInfo[];
  hero: string | null;
}

const RATIOS: { id: ExportRatio; label: () => string }[] = [
  { id: 'portrait', label: m.showcase_export_portrait },
  { id: 'square', label: m.showcase_export_square },
  { id: 'story', label: m.showcase_export_story },
];

/** Storeys, gross area and footprint in one line */
export function houseFacts(p: Project) {
  const storeys = p.levels.filter(l => !l.roof).length;
  return m.showcase_facts({ storeys, area: Math.round(areaReport(p).totalGross) });
}

export function ShowcasePage() {
  const { token } = route.useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['showcase', token], queryFn: () => api<Showcase>(`/showcase/${token}`), retry: false });
  const [heroId, setHeroId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'remix' | 'own' | ExportRatio | null>(null);
  useEffect(() => {
    if (q.data) track('showcase_viewed', undefined, undefined, token);
  }, [!!q.data]);

  if (q.isLoading)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoaderIcon className="animate-spin" />
      </div>
    );
  if (!q.data)
    return (
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle>{m.showcase_gone_title()}</EmptyTitle>
            <EmptyDescription>{m.showcase_gone_description()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );

  const { name, project, renders } = q.data;
  const hero = renders.find(r => r.id === (heroId ?? q.data.hero)) ?? renders[0] ?? null;
  const facts = houseFacts(project);

  const remix = async () => {
    setBusy('remix');
    try {
      track('remix', undefined, undefined, token);
      await ensureGuest();
      const { id } = await api<{ id: string }>(`/showcase/${token}/remix`, { method: 'POST' });
      await navigate({ to: '/p/$projectId', params: { projectId: id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.home_error());
      setBusy(null);
    }
  };
  const own = async () => {
    setBusy('own');
    try {
      track('design_own', undefined, undefined, token);
      const id = await startTrial('blank');
      await navigate({ to: '/p/$projectId', params: { projectId: id }, search: { start: 'interview' } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.home_error());
      setBusy(null);
    }
  };
  const save = async (ratio: ExportRatio) => {
    if (!hero) return;
    setBusy(ratio);
    try {
      await downloadExport(
        renderImageUrl(hero.id),
        ratio,
        { title: name, facts: `${hero.style_name} · ${facts}`, label: m.render_ai_label() },
        `${name}-${hero.style_name}`,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 md:py-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{name}</h1>
          <p className="text-muted-foreground">{hero ? `${hero.style_name} · ${facts}` : facts}</p>
        </header>

        {hero ? (
          <section className="flex flex-col gap-3" aria-label={m.showcase_hero_aria()}>
            {/* As wide as fits with its controls in the first screen */}
            <BeforeAfter
              className="mx-auto w-full max-w-[calc((100dvh-16rem)*4/3)] min-w-[min(100%,20rem)]"
              key={hero.id}
              before={renderImageUrl(hero.id, 'source')}
              after={renderImageUrl(hero.id)}
              alt={m.render_alt({ style: hero.style_name, shot: hero.shot_name })}
            />
            <div className="mx-auto flex w-full max-w-[calc((100dvh-16rem)*4/3)] min-w-[min(100%,20rem)] flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {m.showcase_hero_hint({ shot: hero.shot_name })} · {m.render_ai_label()}
              </p>
              <ButtonGroup aria-label={m.showcase_export_aria()}>
                {RATIOS.map(r => (
                  <Button key={r.id} variant="outline" size="sm" disabled={!!busy} onClick={() => void save(r.id)}>
                    {busy === r.id ? <LoaderIcon className="animate-spin" /> : <DownloadIcon />}
                    {r.label()}
                  </Button>
                ))}
              </ButtonGroup>
            </div>
          </section>
        ) : (
          <HouseViewer project={project} className="aspect-[4/3] w-full" />
        )}

        {renders.length > 1 && (
          <section className="flex flex-col gap-4" aria-label={m.showcase_styles_aria()}>
            <h2 className="text-lg font-semibold">{m.showcase_styles_title()}</h2>
            {byStyle(renders).map(g => (
              <div key={g.name} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">{g.name}</h3>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {g.renders.map(r => (
                    <Button
                      key={r.id}
                      variant="ghost"
                      aria-pressed={r.id === hero?.id}
                      className="h-auto flex-col items-stretch gap-1 p-0 aria-pressed:ring-2 aria-pressed:ring-primary"
                      onClick={() => {
                        setHeroId(r.id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      <img
                        src={renderImageUrl(r.id)}
                        alt={m.render_alt({ style: r.style_name, shot: r.shot_name })}
                        className="aspect-[4/3] w-full rounded-md border object-cover"
                        loading="lazy"
                      />
                      <span className="truncate text-xs font-normal text-muted-foreground">{r.shot_name}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {hero && (
          <section className="flex flex-col gap-3" aria-label={m.showcase_model_aria()}>
            <h2 className="text-lg font-semibold">{m.showcase_model_title()}</h2>
            <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
              <HouseViewer project={project} className="aspect-[4/3] w-full" />
              <PlanPreview project={project} className="aspect-[4/3] w-full rounded-md border" />
            </div>
          </section>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{m.showcase_cta_title()}</CardTitle>
            <CardDescription>{m.showcase_cta_description()}</CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-wrap gap-2">
            <Button onClick={() => void remix()} disabled={!!busy}>
              {busy === 'remix' && <LoaderIcon className="animate-spin" />}
              {m.showcase_remix()}
            </Button>
            <Button variant="outline" onClick={() => void own()} disabled={!!busy}>
              {busy === 'own' && <LoaderIcon className="animate-spin" />}
              {m.showcase_design_own()}
            </Button>
          </CardFooter>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
