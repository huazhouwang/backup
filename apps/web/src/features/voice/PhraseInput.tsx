import { Input } from '@lullabo/ui/input'
import { useState } from 'react'

import { useOptimisticMutation } from '../../lib/optimistic'
import { m } from '../../paraglide/messages.js'
import { type VoiceSettings, voiceApi } from './api'
import { voiceKeys } from './queries'

/** What the user says to Siri; the shortcut must carry the same name. */
export function PhraseInput({ settings }: { settings: VoiceSettings }) {
  const [phrase, setPhrase] = useState(settings.phrase)
  const save = useOptimisticMutation({
    queryKey: voiceKeys.settings,
    mutationFn: voiceApi.rename,
    apply: (current: VoiceSettings, next: string) => ({ ...current, phrase: next }),
    onRefused: (restored) => setPhrase(restored?.phrase ?? settings.phrase),
  })
  return (
    <div className="flex flex-col gap-2">
      <Input
        label={m.voicePhraseLabel()}
        value={phrase}
        maxLength={20}
        onChange={(event) => setPhrase(event.target.value)}
        onBlur={() => {
          const next = phrase.trim()
          if (!next) setPhrase(settings.phrase)
          else if (next !== settings.phrase) save.mutate(next)
        }}
      />
      <p className="m-0 text-muted-foreground">{m.voiceSay({ phrase: settings.phrase })}</p>
    </div>
  )
}
