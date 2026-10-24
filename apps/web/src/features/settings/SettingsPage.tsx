import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DownloadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SiteFooter, SiteHeader } from '@/features/site/SiteHeader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { getLocale, locales, m, setLocale, type Locale } from '@/lib/i18n';
import { authClient } from '@/lib/auth-client';
import { AUTONOMIES, autonomyHint, autonomyLabel, getAutonomy, setAutonomy } from '@/lib/prefs';
import { queryClient, useMe } from '@/lib/query';
import type { Autonomy } from '@/features/editor/agent/policy';
import { AddKey } from './AddKey';
import { type Models } from './models';
import { KeyCard } from './KeyCard';

/** Each language is listed by its own name */
const LANGUAGE_NAME: Record<Locale, () => string> = { zh: m.language_zh, en: m.language_en };

export function SettingsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const user = me.data?.user;
  const [autonomy, setAuto] = useState<Autonomy>('balanced');
  useEffect(() => setAuto(getAutonomy()), []);
  useEffect(() => {
    if (me.isSuccess && !user) void navigate({ to: '/login', search: { redirect: '/settings' } });
  }, [me.isSuccess, user]);
  const models = useQuery({ queryKey: ['models'], queryFn: () => api<Models>('/models'), enabled: !!user });

  const deleteAccount = async () => {
    const r = await authClient.deleteUser();
    if (r.error) {
      toast.error(
        r.error.message === 'Session expired. Re-authenticate to perform this action.'
          ? m.settings_reauth_to_delete()
          : (r.error.message ?? m.settings_delete_failed()),
      );
      return;
    }
    queryClient.clear();
    toast.success(m.settings_account_deleted());
    void navigate({ to: '/' });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-10 px-4 py-6">
        <h1 className="text-xl font-semibold">{m.settings_title()}</h1>

        <section className="space-y-4">
          <div>
            <h2 className="font-medium">{m.settings_models_title()}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{m.settings_models_description()}</p>
          </div>
          {models.data?.keys.map(k => (
            <KeyCard key={k.id} k={k} data={models.data} />
          ))}
          {models.data && <AddKey providers={models.data.providers} />}
        </section>

        <Separator />
        <section className="space-y-3">
          <h2 className="font-medium">{m.settings_autonomy_title()}</h2>
          <Select
            value={autonomy}
            onValueChange={v => {
              setAuto(v as Autonomy);
              setAutonomy(v as Autonomy);
              toast.success(m.settings_autonomy_saved());
            }}
          >
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue>{m.settings_autonomy_option({ label: autonomyLabel(autonomy), hint: autonomyHint(autonomy) })}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AUTONOMIES.map(k => (
                <SelectItem key={k} value={k}>
                  {m.settings_autonomy_option({ label: autonomyLabel(k), hint: autonomyHint(k) })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{m.settings_autonomy_note()}</p>
        </section>

        <Separator />
        <section className="space-y-3">
          <h2 className="font-medium">{m.language_label()}</h2>
          <Select value={getLocale()} onValueChange={v => setLocale(v as Locale)}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue>{LANGUAGE_NAME[getLocale()]()}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {locales.map(l => (
                <SelectItem key={l} value={l}>
                  {LANGUAGE_NAME[l]()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <Separator />
        <section className="space-y-3">
          <h2 className="font-medium">{m.settings_account_title()}</h2>
          <p className="text-sm text-muted-foreground">{user?.isAnonymous ? m.settings_guest() : user?.email}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/account/export" download />}>
              <DownloadIcon /> {m.settings_export()}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="outline" size="sm" className="text-destructive" />}>
                {m.settings_delete_account()}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{m.settings_delete_account_title()}</AlertDialogTitle>
                  <AlertDialogDescription>{m.settings_delete_account_description()}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{m.settings_cancel()}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={deleteAccount}>
                    {m.settings_delete()}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
