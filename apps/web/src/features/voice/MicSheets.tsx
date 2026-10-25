import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { m } from '../../paraglide/messages.js'

/** iPhone and iPad (which presents itself as a Mac with touch). */
const isApple = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)

/** How to stop the browser asking each time: the site's own setting. */
function Steps() {
  if (!isApple()) return <p className="m-0">{m.micStepsOther()}</p>
  return (
    <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
      <li>{m.micStepOpen({ site: window.location.host })}</li>
      <li>{m.micStepMenu()}</li>
      <li>{m.micStepAllow()}</li>
    </ol>
  )
}

/**
 * Before the system first asks for the microphone: why it's needed and how to stop being
 * asked each time. "暂不" leaves the system's question unasked, so a slip can't turn into a
 * refusal that only the browser's settings can undo.
 */
export function MicExplainSheet({
  open,
  onContinue,
  onLater,
}: {
  open: boolean
  /** `hide`: don't explain again on this device. */
  onContinue: (hide: boolean) => void
  onLater: (hide: boolean) => void
}) {
  const [hide, setHide] = useState(false)
  return (
    <Sheet open={open} onClose={() => onLater(hide)} title={m.micExplainTitle()}>
      <p className="m-0">{m.micExplainWhy()}</p>
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-body font-extrabold">{m.micExplainHow()}</h3>
        <Steps />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-touch flex-1 items-center gap-2 text-caption font-bold text-fg-muted">
          <input
            type="checkbox"
            checked={hide}
            onChange={(event) => setHide(event.target.checked)}
            className="size-5 accent-primary"
          />
          {m.micExplainHide()}
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onLater(hide)}>
            {m.micExplainLater()}
          </Button>
          <Button onClick={() => onContinue(hide)}>{m.micExplainContinue()}</Button>
        </div>
      </div>
    </Sheet>
  )
}

/** The microphone was refused: how to turn it back on, or type with the keyboard's dictation. */
export function MicDeniedSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={m.micDeniedTitle()}>
      <p className="m-0">{m.micDeniedWhy()}</p>
      <Steps />
      <p className="m-0 text-fg-muted">{m.micDeniedDictation()}</p>
      <Button size="lg" block onClick={onClose}>
        {m.micDeniedOk()}
      </Button>
    </Sheet>
  )
}
