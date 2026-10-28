import { Button } from '@lullabo/ui/button'

import { m } from '../../paraglide/messages.js'

/** Yes and no to a change the agent waits on (deleting a record). */
export function ConfirmAnswer({ onAnswer }: { onAnswer: (answer: string) => void }) {
  return (
    <div className="flex gap-2">
      <Button className="flex-1 shrink-0" onClick={() => onAnswer(m.voiceYes())}>
        {m.voiceYes()}
      </Button>
      <Button variant="outline" className="flex-1 shrink-0" onClick={() => onAnswer(m.voiceNo())}>
        {m.voiceNo()}
      </Button>
    </div>
  )
}
