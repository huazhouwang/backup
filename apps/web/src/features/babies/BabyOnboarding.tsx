import { localDateString } from '@lullabo/shared'

import { Bun } from '../../components/ui/Bun'
import { Card } from '../../components/ui/Card'
import { useLocalStore } from '../../db'
import { m } from '../../paraglide/messages.js'
import { createBaby } from './actions'
import { BabyForm } from './BabyForm'
import { selectBaby } from './use-babies'

/** First-run flow: shown instead of a page's content until a baby exists. */
export function BabyOnboarding() {
  const store = useLocalStore()

  return (
    <section className="flex flex-col gap-4">
      <Bun mood="happy" className="size-24 self-center" />
      <h1 className="text-display font-extrabold">{m.onboardingTitle()}</h1>
      <p className="text-fg-muted">{m.onboardingBody()}</p>
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
    </section>
  )
}
