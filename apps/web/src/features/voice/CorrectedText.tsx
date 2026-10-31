import { cn } from '@lullabo/ui/utils'
import { useState } from 'react'

import { Chevron } from '../../components/icons/Chevron'
import { m } from '../../paraglide/messages.js'
import { ChangingText } from './ChangingText'

/**
 * A spoken message as corrected, and what the speech model heard behind a tap, when the
 * correction changed the words: to see when it got them wrong.
 */
export function CorrectedText({ text, heard }: { text: string; heard?: string }) {
  const [open, setOpen] = useState(false)
  if (!heard) return <ChangingText text={text} />
  return (
    <>
      <ChangingText text={text} />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mt-1 flex items-center gap-0.5 text-caption font-bold opacity-75"
      >
        {m.voiceHeardOriginal()}
        <Chevron
          direction="down"
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && <span className="block text-caption opacity-75">{heard}</span>}
    </>
  )
}
