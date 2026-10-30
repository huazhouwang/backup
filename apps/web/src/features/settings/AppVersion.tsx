import { Button } from '@lullabo/ui/button'
import { Card } from '@lullabo/ui/card'
import { showToast } from '@lullabo/ui/toast'
import { useState } from 'react'

import { showUpdateToast } from '../../app/UpdatePrompt'
import { formatDate } from '../../lib/i18n'
import {
  type UpdateCheck,
  canUpdate,
  checkForUpdateNow,
  getWaitingUpdate,
  useWaitingUpdate,
} from '../../lib/pwa'
import { m } from '../../paraglide/messages.js'

/** "版本 2df2dce · 10月14日" */
export const versionLabel = () =>
  m.settingsVersionDated({
    build: import.meta.env.APP_BUILD,
    date: formatDate(import.meta.env.APP_BUILT_AT, { month: 'long', day: 'numeric' }),
  })

/** The version for the settings index: says so when an update is waiting. */
export function useVersionSummary() {
  return useWaitingUpdate() ? m.updateReady() : versionLabel()
}

const resultText: Record<Exclude<UpdateCheck, 'ready'>, () => string> = {
  latest: m.updateLatest,
  offline: m.updateOffline,
  failed: m.updateFailed,
}

/** The running version, with a button to look for a newer one; the result shows as a toast. */
export function VersionCard() {
  const [checking, setChecking] = useState(false)

  const check = async () => {
    setChecking(true)
    const result = await checkForUpdateNow()
    setChecking(false)
    // The update toast may have been swiped away earlier; show it again.
    const apply = getWaitingUpdate()
    if (result === 'ready' && apply) showUpdateToast(apply)
    else if (result !== 'ready') {
      showToast(resultText[result](), {
        id: 'update-check',
        tone: result === 'latest' ? 'success' : 'error',
      })
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="m-0 font-bold">{versionLabel()}</p>
      {canUpdate() && (
        <Button
          variant="soft"
          tone="primary"
          block
          disabled={checking}
          onClick={() => void check()}
        >
          {checking ? m.updateChecking() : m.updateCheck()}
        </Button>
      )}
    </Card>
  )
}
