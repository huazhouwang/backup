import { Button } from '@lullabo/ui/button'
import { FormError } from '@lullabo/ui/form-error'
import { Sheet } from '@lullabo/ui/sheet'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { formatDate, formatTime } from '../../lib/i18n'
import { m } from '../../paraglide/messages.js'
import { SHORTCUT_NAME, type VoiceSettings, copyWhenReady, openShortcut, voiceApi } from './api'
import { voiceKeys } from './queries'

/** Adds the shortcut: first the steps, then a code is copied and the shortcut opened. */
export function Connect({ settings }: { settings: VoiceSettings }) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: voiceKeys.settings })
  const [guide, setGuide] = useState(false)
  const add = useMutation({
    mutationFn: async () => {
      const token = voiceApi.createToken().then((created) => created.token)
      await copyWhenReady(token)
      openShortcut()
    },
    onSuccess: () => setGuide(false),
    onSettled: refresh,
  })
  const revoke = useMutation({ mutationFn: voiceApi.revokeToken, onSettled: refresh })

  const guideSheet = (
    <Sheet open={guide} onClose={() => setGuide(false)} title={m.voiceAdd()}>
      <div className="flex flex-col gap-4">
        <ol className="m-0 flex list-decimal flex-col gap-3 pl-5">
          <li>{m.voiceGuideCopy()}</li>
          <li>{m.voiceGuideGet()}</li>
          <li>{m.voiceGuidePaste()}</li>
          {settings.phrase !== SHORTCUT_NAME && (
            <li>{m.voiceStepRename({ name: SHORTCUT_NAME, phrase: settings.phrase })}</li>
          )}
          <li>{m.voiceGuideTry({ phrase: settings.phrase })}</li>
        </ol>
        {settings.token && (
          <p className="m-0 text-caption text-muted-foreground">{m.voiceReaddHint()}</p>
        )}
        <Button size="lg" block disabled={add.isPending} onClick={() => add.mutate()}>
          {m.voiceGuideGo()}
        </Button>
        {add.isError && <FormError>{m.actionFailed()}</FormError>}
      </div>
    </Sheet>
  )

  if (!settings.token) {
    return (
      <>
        <Button size="lg" block disabled={!settings.ai} onClick={() => setGuide(true)}>
          {m.voiceAdd()}
        </Button>
        {guideSheet}
      </>
    )
  }

  const { createdAt, lastUsedAt } = settings.token
  return (
    <>
      <div className="flex flex-col">
        <span className="font-extrabold text-accent-foreground">{m.voiceConnected()}</span>
        <span className="text-caption text-muted-foreground">
          {[
            m.voiceAddedOn({ date: formatDate(createdAt) }),
            lastUsedAt
              ? m.voiceLastUsed({ time: `${formatDate(lastUsedAt)} ${formatTime(lastUsedAt)}` })
              : m.voiceNeverUsed(),
          ].join(' · ')}
        </span>
      </div>
      {/* Shortcuts may stay on its add sheet although it added the shortcut: a first try settles it. */}
      {!lastUsedAt && <p className="m-0 text-caption text-muted-foreground">{m.voiceTryNow()}</p>}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 shrink-0" onClick={() => setGuide(true)}>
          {m.voiceReadd()}
        </Button>
        <Button
          variant="ghost"
          tone="destructive"
          className="flex-1 shrink-0"
          disabled={revoke.isPending}
          onClick={() => revoke.mutate()}
        >
          {m.voiceRevoke()}
        </Button>
      </div>
      {revoke.isError && <FormError>{m.actionFailed()}</FormError>}
      {guideSheet}
    </>
  )
}
