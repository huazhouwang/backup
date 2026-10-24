import { migrate } from '@plinth/core';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRightIcon, CheckIcon, LoaderIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import sampleJson from '../../../../../samples/wushi-10/project.json';
import { PlanPreview } from '@/features/site/PlanPreview';
import { SiteFooter, SiteHeader } from '@/features/site/SiteHeader';
import { Button } from '@/components/ui/button';
import { Card, CardDescription } from '@/components/ui/card';
import { m } from '@/lib/i18n';
import { useMe } from '@/lib/query';
import { startTrial } from '@/features/site/trial';

const sample = migrate(sampleJson);

const STEPS = [
  { t: m.home_step_1_title, d: m.home_step_1_body },
  { t: m.home_step_2_title, d: m.home_step_2_body },
  { t: m.home_step_3_title, d: m.home_step_3_body },
];

const POINTS = [m.home_point_1, m.home_point_2, m.home_point_3, m.home_point_4];

export function HomePage() {
  const me = useMe();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (t: 'sample' | 'blank') => {
    setBusy(t);
    try {
      const id = await startTrial(t);
      await navigate({ to: '/p/$projectId', params: { projectId: id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.home_error());
      setBusy(null);
    }
  };
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <section className="grid items-center gap-10 py-12 md:grid-cols-[1fr_1.1fr] md:py-20">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{m.home_title()}</h1>
            <p className="mt-4 text-muted-foreground text-pretty">{m.home_intro()}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button size="lg" onClick={() => go('sample')} disabled={!!busy}>
                {busy === 'sample' ? <LoaderIcon className="animate-spin" /> : null}
                {m.home_try_sample()} <ArrowRightIcon />
              </Button>
              <Button size="lg" variant="outline" onClick={() => go('blank')} disabled={!!busy}>
                {busy === 'blank' ? <LoaderIcon className="animate-spin" /> : null}
                {m.home_start_blank()}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {m.home_no_sign_up()}
              {me.data?.user && !me.data.user.isAnonymous ? (
                <Button variant="link" className="h-auto p-0 text-xs" nativeButton={false} render={<Link to="/projects" />}>
                  {m.home_my_projects()}
                </Button>
              ) : (
                <>
                  <Button variant="link" className="h-auto p-0 text-xs" nativeButton={false} render={<Link to="/login" />}>
                    {m.home_sign_in()}
                  </Button>
                  {m.home_sign_in_after()}
                </>
              )}
            </p>
          </div>
          <Card className="gap-2 p-3">
            <figure>
              <PlanPreview project={sample} className="w-full" />
              <CardDescription className="px-1 pt-2 text-xs">{m.home_sample_caption()}</CardDescription>
            </figure>
          </Card>
        </section>

        <section className="grid gap-6 border-t py-12 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={i}>
              <p className="font-mono text-xs text-muted-foreground">0{i + 1}</p>
              <h2 className="mt-1 font-medium">{s.t()}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{s.d()}</p>
            </div>
          ))}
        </section>

        <section className="border-t py-12">
          <ul className="grid gap-3 md:grid-cols-2">
            {POINTS.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <CheckIcon className="mt-0.5 size-4 shrink-0" />
                {p()}
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
