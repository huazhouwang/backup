import { Card, NoticeCard } from '@lullabo/ui/card'
import { useQuery } from '@tanstack/react-query'

import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { SignInNotice } from '../account/SignInNotice'
import { KeysCard } from './KeysCard'
import { ModelCard } from './ModelCard'
import { aiQueries } from './queries'
import { ShareCard } from './ShareCard'

/** The settings row's status: the model in use, if the user set one. */
export function useAiSummary() {
  const { userId } = useAccess()
  const { data } = useQuery({ ...aiQueries.mine(), enabled: Boolean(userId) })
  if (!userId) return m.settingsNeedsSignIn()
  return data?.choice ? data.choice.model : m.aiSummaryOff()
}

/** The user's own AI: what voice commands use in every family, and who it is shared with. */
export function MyAi() {
  const { userId } = useAccess()
  if (!userId) {
    return <SignInNotice>{m.aiSignedOut()}</SignInNotice>
  }
  return <MyAiCards />
}

function MyAiCards() {
  const { data: ai, isPending, isError } = useQuery(aiQueries.mine())
  // Loaded with the saved keys as soon as the page opens, so picking needs no extra step.
  const models = useQuery({ ...aiQueries.models(), enabled: (ai?.keys.length ?? 0) > 0 })
  if (isPending || isError) {
    return <NoticeCard>{isError ? m.voiceLoadFailed() : m.joinLoading()}</NoticeCard>
  }
  const providers = models.data?.providers
  return (
    <>
      <Card>
        <p className="m-0">{m.aiIntro()}</p>
      </Card>
      <KeysCard ai={ai} providers={providers} />
      <ModelCard ai={ai} providers={providers} loading={models.isPending} />
      {ai.choice && <ShareCard ai={ai} />}
    </>
  )
}
