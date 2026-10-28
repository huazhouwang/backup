import { localDateString } from '@lullabo/shared'
import { Bun } from '@lullabo/ui/bun'
import { Card } from '@lullabo/ui/card'
import { Link } from '@tanstack/react-router'

import { useLocalStore } from '../../db'
import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { createBaby } from './actions'
import { BabyForm } from './BabyForm'
import { selectBaby } from './use-babies'

/** First-run flow: shown instead of a page's content until a baby exists. */
export function BabyOnboarding() {
  const store = useLocalStore()
  const { userId } = useAccess()

  return (
    <section className="flex flex-col gap-4">
      <Bun mood="happy" className="size-24 self-center" />
      <h1 className="text-display font-extrabold">{m.onboardingTitle()}</h1>
      <p className="text-muted-foreground">{m.onboardingBody()}</p>
      <Card>
        <BabyForm
          initial={{
            name: '',
            birthDate: localDateString(),
            sex: 'unspecified',
            avatarColor: 'green',
          }}
          submitLabel={m.onboardingSubmit()}
          onSubmit={(input) => selectBaby(createBaby(store, input).id)}
        />
      </Card>
      {/* A new device or a new address: signing in brings the babies and records back. */}
      {!userId && (
        <Link
          to="/settings/account"
          className="flex min-h-touch items-center self-center font-extrabold text-accent-foreground"
        >
          {m.onboardingSignIn()}
        </Link>
      )}
    </section>
  )
}
