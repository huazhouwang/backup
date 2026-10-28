import { Button } from '@lullabo/ui/button'
import { Card, CardTitle } from '@lullabo/ui/card'
import { FormError } from '@lullabo/ui/form-error'
import { Input } from '@lullabo/ui/input'
import { Sheet } from '@lullabo/ui/sheet'
import { cn } from '@lullabo/ui/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '../../paraglide/messages.js'
import {
  AI_PROVIDERS,
  type AiProvider,
  PROVIDER_LABEL,
  type ProviderModels,
  type UserAi,
  aiApi,
} from './api'
import { aiKeys } from './queries'
import { useAiChange, useSaved } from './use-saved'

/** A key per provider: whether it works, and adding or replacing it. */
export function KeysCard({ ai, providers }: { ai: UserAi; providers?: ProviderModels[] }) {
  const [editing, setEditing] = useState<AiProvider | null>(null)
  const [lastEditing, setLastEditing] = useState<AiProvider>('openai')
  const open = (provider: AiProvider) => {
    setEditing(provider)
    setLastEditing(provider)
  }
  return (
    <Card as="section" className="flex flex-col gap-1">
      <CardTitle small>{m.aiKeysTitle()}</CardTitle>
      <ul className="m-0 flex list-none flex-col p-0">
        {AI_PROVIDERS.map((provider) => {
          const key = ai.keys.find((item) => item.provider === provider)
          const status = providers?.find((item) => item.provider === provider)?.status
          return (
            <li
              key={provider}
              className="flex min-h-touch items-center gap-3 border-b-2 border-border py-2 last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-extrabold">{PROVIDER_LABEL[provider]}</span>
                <KeyStatus hint={key?.keyHint} status={status} />
              </span>
              <Button variant="outline" onClick={() => open(provider)}>
                {key ? m.aiKeyReplace() : m.aiKeyAdd()}
              </Button>
            </li>
          )
        })}
      </ul>
      <p className="m-0 text-caption text-muted-foreground">{m.aiKeysHint()}</p>
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={m.aiKeySheetTitle({ provider: PROVIDER_LABEL[lastEditing] })}
      >
        {editing && (
          <KeyForm
            key={editing}
            provider={editing}
            saved={ai.keys.find((item) => item.provider === editing)?.keyHint}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </Card>
  )
}

function KeyStatus({ hint, status }: { hint?: string; status?: ProviderModels['status'] }) {
  if (!hint) return <span className="text-caption text-muted-foreground">{m.aiKeyNone()}</span>
  const [text, tone] =
    status === 'invalid'
      ? [m.aiKeyInvalidNow(), 'text-destructive-text']
      : status === 'unreachable'
        ? [m.aiKeyUnreachable(), 'text-muted-foreground']
        : status === 'ok'
          ? [m.aiKeyWorks(), 'text-accent-foreground']
          : ['', '']
  return (
    <span className="truncate text-caption text-muted-foreground">
      {hint}
      {text && <span className={cn('font-bold', tone)}>{` · ${text}`}</span>}
    </span>
  )
}

function KeyForm({
  provider,
  saved,
  onDone,
}: {
  provider: AiProvider
  saved?: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const onSaved = useSaved()
  const [apiKey, setApiKey] = useState('')
  const done = (next: UserAi) => {
    onSaved(next)
    void queryClient.invalidateQueries({ queryKey: aiKeys.models })
    onDone()
  }
  const save = useMutation({
    mutationFn: () => aiApi.saveKey(provider, apiKey.trim()),
    onSuccess: done,
  })
  // Removing shows at once, as the server will: the model goes with its key, and the shares
  // with the last key.
  const remove = useAiChange(
    () => aiApi.removeKey(provider),
    (ai) => {
      const keys = ai.keys.filter((key) => key.provider !== provider)
      return {
        keys,
        choice: ai.choice?.provider === provider ? null : ai.choice,
        sharedFamilyIds: keys.length > 0 ? ai.sharedFamilyIds : [],
      }
    },
    () => void queryClient.invalidateQueries({ queryKey: aiKeys.models }),
  )
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (apiKey.trim()) save.mutate()
      }}
    >
      <Input
        label={m.aiKeyLabel()}
        type="password"
        autoComplete="off"
        placeholder={provider === 'openai' ? 'sk-…' : 'sk-or-…'}
        hint={saved ? m.aiKeyReplaces({ hint: saved }) : m.aiKeyPrivacy()}
        value={apiKey}
        onChange={(event) => {
          setApiKey(event.target.value)
          save.reset()
        }}
      />
      <Button type="submit" size="lg" block disabled={save.isPending || apiKey.trim() === ''}>
        {save.isPending ? m.aiChecking() : m.aiKeySave()}
      </Button>
      {save.isError && <FormError>{m.aiKeyInvalid()}</FormError>}
      {saved && (
        <Button
          type="button"
          variant="ghost"
          tone="destructive"
          onClick={() => {
            remove.mutate()
            onDone()
          }}
        >
          {m.aiKeyRemove()}
        </Button>
      )}
    </form>
  )
}
