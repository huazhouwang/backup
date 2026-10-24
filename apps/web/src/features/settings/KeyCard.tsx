import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { ModelInput } from './ModelInput';
import { refreshModels, type Models } from './models';

/** A saved key with the models picked for it */
export function KeyCard({ k, data }: { k: Models['keys'][number]; data: Models }) {
  const qc = useQueryClient();
  const provider = data.providers[k.provider];
  const [model, setModel] = useState('');
  const fail = (e: Error) => toast.error(e.message);
  const addModel = useMutation({
    mutationFn: () => api('/models', { method: 'POST', json: { keyId: k.id, model } }),
    onSuccess: () => {
      setModel('');
      void refreshModels(qc);
    },
    onError: fail,
  });
  const delModel = useMutation({ mutationFn: (id: string) => api(`/models/${id}`, { method: 'DELETE' }), onSuccess: () => refreshModels(qc), onError: fail });
  const delKey = useMutation({ mutationFn: () => api(`/keys/${k.id}`, { method: 'DELETE' }), onSuccess: () => refreshModels(qc), onError: fail });
  const setDefault = useMutation({
    mutationFn: (id: string) => api('/models/default', { method: 'PUT', json: { modelId: id } }),
    onSuccess: () => {
      void refreshModels(qc);
      toast.success(m.settings_default_saved());
    },
    onError: fail,
  });
  const models = data.models.filter(x => x.key_id === k.id);
  return (
    <Card className="gap-3 p-4" data-testid="api-key">
      <div className="flex items-center gap-2">
        <KeyRoundIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{provider?.name ?? k.provider}</p>
          <p className="truncate text-xs text-muted-foreground">
            {k.key_hint}
            {k.base_url ? ` · ${k.base_url}` : ''}
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label={m.settings_delete_key()} />}>
            <Trash2Icon />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{m.settings_delete_key_title()}</AlertDialogTitle>
              <AlertDialogDescription>{m.settings_delete_key_description()}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.settings_cancel()}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => delKey.mutate()}>
                {m.settings_delete()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <ItemGroup className="gap-1">
        {models.map(x => (
          <Item key={x.id} variant="muted" size="xs">
            <ItemContent className="min-w-0">
              <ItemTitle className="truncate">{x.label}</ItemTitle>
            </ItemContent>
            <ItemActions>
              {x.id === data.defaultModelId ? (
                <Badge variant="secondary">{m.settings_default_badge()}</Badge>
              ) : (
                <Button size="xs" variant="ghost" onClick={() => setDefault.mutate(x.id)}>
                  {m.settings_set_default()}
                </Button>
              )}
              <Button size="icon-xs" variant="ghost" aria-label={m.settings_delete_model({ model: x.label })} onClick={() => delModel.mutate(x.id)}>
                <Trash2Icon />
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault();
          if (model.trim()) addModel.mutate();
        }}
      >
        <ModelInput
          value={model}
          onChange={setModel}
          suggestions={(provider?.models ?? []).filter(s => !models.some(x => x.model === s))}
          className="h-8 flex-1"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!model.trim() || addModel.isPending}>
          <PlusIcon />
          {m.settings_add_model()}
        </Button>
      </form>
    </Card>
  );
}
