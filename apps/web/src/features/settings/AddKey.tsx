import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { ModelInput } from './ModelInput';
import { refreshModels, type Models } from './models';

/** Save a provider key together with the first model to use with it */
export function AddKey({ providers }: { providers: Models['providers'] }) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState(providers.anthropic?.models[0] ?? '');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const p = providers[provider];
  const add = useMutation({
    mutationFn: () => api('/keys', { method: 'POST', json: { provider, apiKey, model, baseUrl: p.needsBaseUrl ? baseUrl : null } }),
    onSuccess: () => {
      setApiKey('');
      void refreshModels(qc);
      toast.success(m.settings_key_added());
    },
    onError: e => toast.error(e.message),
  });
  return (
    <Card className="p-4">
      <form
        className="space-y-3"
        onSubmit={e => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <h3 className="text-sm font-medium">{m.settings_add_key_title()}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>{m.settings_provider()}</FieldLabel>
            <Select
              value={provider}
              onValueChange={v => {
                setProvider(v as string);
                setModel(providers[v as string].models[0] ?? '');
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{p.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(providers).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="model">{m.settings_model()}</FieldLabel>
            <ModelInput id="model" value={model} onChange={setModel} suggestions={p.models} />
          </Field>
        </div>
        {p.needsBaseUrl && (
          <Field>
            <FieldLabel htmlFor="base">{m.settings_base_url()}</FieldLabel>
            <Input id="base" type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" required />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="key">API Key</FieldLabel>
          <Input id="key" type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} required />
          <FieldDescription>
            {p.hint}
            {m.settings_key_hint()}
          </FieldDescription>
        </Field>
        <Button type="submit" size="sm" disabled={add.isPending || !apiKey || !model.trim()}>
          {add.isPending && <LoaderIcon className="animate-spin" />}
          {m.settings_save_key()}
        </Button>
      </form>
    </Card>
  );
}
