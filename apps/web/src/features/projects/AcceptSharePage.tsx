import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { LoaderIcon } from 'lucide-react';
import { useState } from 'react';
import { Logo } from '@/features/site/SiteHeader';
import { Button } from '@/components/ui/button';
import { api, roleLabel } from '@/lib/api';
import type { Role } from '@/shared/roles';
import { authClient } from '@/lib/auth-client';
import { m } from '@/lib/i18n';
import { queryClient, useMe } from '@/lib/query';

const route = getRouteApi('/s/$token');

export function AcceptSharePage() {
  const { token } = route.useParams();
  const me = useMe();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = useQuery({ queryKey: ['share', token], queryFn: () => api<{ projectId: string; name: string; role: Role }>(`/share/${token}`), retry: false });

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!me.data?.user) {
        const r = await authClient.signIn.anonymous();
        if (r.error) throw new Error(r.error.message ?? m.share_link_cannot_enter());
        await queryClient.invalidateQueries({ queryKey: ['me'] });
      }
      const r = await api<{ projectId: string }>(`/share/${token}/accept`, { method: 'POST' });
      await navigate({ to: '/p/$projectId', params: { projectId: r.projectId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : m.share_link_error());
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-5 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        {link.isLoading ? (
          <LoaderIcon className="mx-auto animate-spin" />
        ) : link.error ? (
          <p className="text-muted-foreground">{m.share_link_invalid()}</p>
        ) : (
          <>
            <div>
              <p className="text-sm text-muted-foreground">{m.share_link_intro()}</p>
              <h1 className="mt-1 text-xl font-semibold">{link.data!.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{m.share_link_role({ role: roleLabel(link.data!.role) })}</p>
            </div>
            <Button className="w-full" onClick={accept} disabled={busy}>
              {busy && <LoaderIcon className="animate-spin" />}
              {m.share_link_open()}
            </Button>
            {!me.data?.user && <p className="text-xs text-muted-foreground">{m.share_link_no_sign_up()}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
