/**
 * Publishing a design's share page (issue 196), for its owner: publish (the images so far go on it), copy or open the link,
 * stop sharing (the link stops working; publishing again makes a new one). Which images show, and the cover, are set per image
 * in the gallery.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';

export interface ShowcaseInfo {
  token: string;
  hero: string | null;
}

export const useShowcase = (projectId: string) =>
  useQuery({ queryKey: ['showcase-of', projectId], queryFn: () => api<ShowcaseInfo | null>(`/projects/${projectId}/showcase`) });

export const showcaseUrl = (token: string) => `${location.origin}/h/${token}`;

export function ShareControls({ projectId, owner, count }: { projectId: string; owner: boolean; count: number }) {
  const qc = useQueryClient();
  const showcase = useShowcase(projectId);
  const [busy, setBusy] = useState(false);
  const change = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    try {
      await api(`/projects/${projectId}/showcase`, { method });
    } finally {
      setBusy(false);
    }
    void qc.invalidateQueries({ queryKey: ['showcase-of', projectId] });
    void qc.invalidateQueries({ queryKey: ['renders', projectId] });
  };
  const s = showcase.data;
  if (!s && (!owner || !count)) return null;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{s ? m.showcase_published_title() : m.showcase_publish_title()}</CardTitle>
        <CardDescription>{s ? m.showcase_published_description() : m.showcase_publish_description()}</CardDescription>
        {owner && (
          <CardAction>
            <Button size="sm" variant={s ? 'outline' : 'default'} disabled={busy} onClick={() => void change(s ? 'DELETE' : 'POST')}>
              {s ? m.showcase_unpublish() : m.showcase_publish()}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      {s && (
        <CardContent>
          <InputGroup>
            <InputGroupInput readOnly value={showcaseUrl(s.token)} aria-label={m.showcase_link_aria()} />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label={m.showcase_copy()}
                onClick={() => void navigator.clipboard.writeText(showcaseUrl(s.token)).then(() => toast.success(m.showcase_copied()))}
              >
                <CopyIcon />
              </InputGroupButton>
              <InputGroupButton aria-label={m.showcase_open()} nativeButton={false} render={<a href={showcaseUrl(s.token)} target="_blank" rel="noreferrer" />}>
                <ExternalLinkIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </CardContent>
      )}
    </Card>
  );
}
