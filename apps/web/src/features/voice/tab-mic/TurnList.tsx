import { APP_NAME } from '@lullabo/shared'
import { riseIn } from '@lullabo/ui/motion'
import { cn } from '@lullabo/ui/utils'
import { AnimatePresence, m as motion } from 'motion/react'

import { m } from '../../../paraglide/messages.js'
import { ChangingText, typingDots } from '../ChangingText'
import { ConfirmAnswer } from '../ConfirmAnswer'
import { CorrectedText } from '../CorrectedText'
import type { Phase, Talk, Turn } from './types'

/** A user's message, as in the chat. */
const userBubble =
  'max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-4 py-3 text-body font-bold text-primary-foreground wrap-anywhere'

/**
 * What was said and answered since the overlay opened, oldest first, with the next message
 * on its way while talking; and why the last recording came to nothing.
 */
export function TurnList({
  turns,
  phase,
  live,
  problem,
  talk,
  onAnswer,
}: {
  turns: Turn[]
  phase: Phase
  live: string
  problem: string | null
  talk: Talk
  /** Yes or no to a change the AI waits on. */
  onAnswer: (answer: string) => void
}) {
  const last = turns.at(-1)
  // Talking or being heard, after a first turn: on its way as the next message.
  const pending = phase === 'talking' || phase === 'hearing'
  return (
    <>
      <AnimatePresence initial={false}>
        {turns.flatMap((turn) => [
          <motion.div key={`${turn.id}-said`} layout="position" {...riseIn} className={userBubble}>
            <span className="sr-only">{m.voiceChatSpeakerMe()}</span>
            <CorrectedText text={turn.said} heard={turn.heard} />
          </motion.div>,
          <motion.div
            key={`${turn.id}-reply`}
            layout="position"
            {...riseIn}
            className="flex max-w-[90%] flex-col gap-2 self-start rounded-2xl rounded-bl-md border-2 border-border bg-background px-4 py-3"
          >
            <span className="text-caption font-extrabold text-accent-foreground">{APP_NAME}</span>
            {turn.reply ? (
              <p className="m-0 wrap-anywhere">
                <ChangingText text={turn.reply} />
              </p>
            ) : turn.problem ? null : (
              <span className="text-muted-foreground">
                {typingDots}
                <span className="sr-only">{m.voiceThinking()}</span>
              </span>
            )}
            {turn.problem && <p className="m-0 font-bold text-destructive-text">{turn.problem}</p>}
            {turn === last && turn.confirming && phase === 'done' && (
              <ConfirmAnswer onAnswer={onAnswer} />
            )}
          </motion.div>,
        ])}
        {/* The next message on its way; it stays put as it becomes the turn. */}
        {pending && (
          <motion.div
            key={`${turns.length}-said`}
            layout="position"
            {...riseIn}
            className={cn(userBubble, talk.aiming && 'line-through opacity-60')}
          >
            <span className={live ? 'sr-only' : 'mr-2 text-caption'}>
              {phase === 'hearing'
                ? m.voiceHearing()
                : talk.ready
                  ? m.voiceListening()
                  : m.voiceMicPreparing()}
            </span>
            {live && <ChangingText text={live} />} {typingDots}
          </motion.div>
        )}
      </AnimatePresence>
      {problem && !pending && (
        <p className="m-0 text-center font-bold text-destructive-text">{problem}</p>
      )}
    </>
  )
}
