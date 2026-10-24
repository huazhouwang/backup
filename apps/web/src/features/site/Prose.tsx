import type { ReactNode } from 'react';
import { m } from '@/lib/i18n';
import { SiteFooter, SiteHeader } from './SiteHeader';

export function ProsePage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{m.site_updated({ date: updated })}</p>
        <div className="mt-6 space-y-4 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-medium [&_li]:ml-5 [&_li]:list-disc">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
