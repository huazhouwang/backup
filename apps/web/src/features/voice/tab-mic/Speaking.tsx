import { Bun } from '@lullabo/ui/bun'
import { cn } from '@lullabo/ui/utils'

import { m } from '../../../paraglide/messages.js'
import { ChangingText, typingDots } from '../ChangingText'
import { Elapsed } from '../Elapsed'
import type { Phase, Talk } from './types'

/**
 * Before the first answer: what is being said, large, down by the microphone where the frost
 * is thickest; or why it came to nothing.
 */
export function Speaking({
  phase,
  live,
  problem,
  talk,
}: {
  phase: Phase
  live: string
  problem: string | null
  talk: Talk
}) {
  // Talking or being heard: on its way as a message.
  const pending = phase === 'talking' || phase === 'hearing'
  return (
    <div
      // Down by the microphone, where the frost is thickest.
      className="flex flex-1 flex-col items-center justify-end gap-4 pb-4 text-center"
      aria-live="polite"
    >
      {/* Above what is said: how long it has been recording, or that it is being
                    heard once said (the words themselves show below). */}
      {phase === 'talking' && talk.ready ? (
        <span className="text-caption font-extrabold tracking-wide text-accent-foreground">
          {m.voiceListening()}
          {' · '}
          <Elapsed since={talk.startedAt} />
        </span>
      ) : phase === 'hearing' && live ? (
        <span className="text-caption font-extrabold tracking-wide text-accent-foreground">
          {m.voiceHearing()}
        </span>
      ) : null}
      {problem && !pending && <Bun mood="oops" className="size-20" />}
      <p
        className={cn(
          'm-0 text-[28px] leading-10 font-extrabold wrap-anywhere',
          talk.aiming && 'text-muted-foreground/60 line-through',
          problem && !pending && 'text-destructive-text',
        )}
      >
        {problem && !pending ? (
          problem
        ) : live ? (
          <ChangingText text={live} />
        ) : phase === 'hearing' ? (
          m.tabMicHearing()
        ) : talk.ready ? (
          m.tabMicSpeak()
        ) : (
          m.voiceMicPreparing()
        )}
      </p>
      {pending && typingDots}
    </div>
  )
}
