import { Button } from '@lullabo/ui/button'
import { Card, CardTitle } from '@lullabo/ui/card'

import { isIos, isStandalone, useInstallPrompt } from '../../lib/pwa'
import { m } from '../../paraglide/messages.js'

/** Encourages installing the PWA; hidden once running from the home screen. */
export function InstallCard() {
  const install = useInstallPrompt()
  if (isStandalone()) return null

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>{m.installTitle()}</CardTitle>
      <p className="m-0 text-muted-foreground">{m.installBody()}</p>
      {install ? (
        <Button block onClick={() => void install()}>
          {m.installButton()}
        </Button>
      ) : (
        <p className="m-0 font-bold">{isIos() ? m.installIosSteps() : m.installAndroidSteps()}</p>
      )}
    </Card>
  )
}
