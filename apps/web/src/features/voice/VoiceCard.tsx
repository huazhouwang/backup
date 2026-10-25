import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { buttonClass } from '../../components/ui/Button'
import { Card, NoticeCard } from '../../components/ui/Card'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { SignInNotice } from '../account/SignInNotice'
import { type VoiceSettings } from './api'
import { Connect } from './Connect'
import { PhraseInput } from './PhraseInput'
import { voiceQueries } from './queries'

/** The settings row's status: whether Siri can add records for this account. */
export function useVoiceSummary() {
  const { userId } = useAccess()
  const { data } = useQuery({ ...voiceQueries.settings(), enabled: Boolean(userId) })
  if (!userId) return m.settingsNeedsSignIn()
  return data?.token ? m.voiceSummaryOn() : m.voiceSummaryOff()
}

/** Siri voice logging in settings: signed-in users only, as records go to the server. */
export function VoiceCard() {
  const { userId } = useAccess()
  if (!userId) {
    return <SignInNotice>{m.voiceSignedOut()}</SignInNotice>
  }
  return <Voice />
}

function Voice() {
  const { data: settings, isError } = useQuery(voiceQueries.settings())
  if (!settings) {
    return <NoticeCard>{isError ? m.voiceLoadFailed() : m.joinLoading()}</NoticeCard>
  }
  return (
    <>
      <AiStatus settings={settings} />
      <Card as="section" className="flex flex-col gap-3">
        <p className="m-0">{m.voiceIntro()}</p>
        <PhraseInput settings={settings} />
        <Connect settings={settings} />
      </Card>
      {settings.ai && <ChatCard />}
      <Card>
        <p className="m-0 text-caption text-fg-muted">{m.voiceBackTap()}</p>
      </Card>
    </>
  )
}

/** Whose AI the commands use, and how to record in more families. */
function AiStatus({ settings }: { settings: VoiceSettings }) {
  const { ai } = settings
  if (ai?.kind === 'own') return null
  const link = (
    <Link to="/settings/ai" className="font-bold underline">
      {m.aiMineTitle()}
    </Link>
  )
  return (
    <Card tone="feeding">
      <p className="m-0">
        {ai ? m.voiceAiShared({ by: ai.by, family: ai.familyName }) : m.voiceAiNone()} {link}
      </p>
    </Card>
  )
}

/** Opens the chat. */
function ChatCard() {
  return (
    <Card className="flex flex-col gap-2">
      <Link to="/chat" className={buttonClass({ variant: 'outline', block: true })}>
        {m.voiceChatOpen()}
      </Link>
      <p className="m-0 text-caption text-fg-muted">{m.voiceChatHint()}</p>
    </Card>
  )
}
