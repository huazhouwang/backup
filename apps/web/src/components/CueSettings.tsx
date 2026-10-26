import {
  CUES,
  CUE_MODES,
  type Cue,
  type CueMode,
  playCue,
  setCueMode,
  useCueMode,
} from '../lib/cues'
import { m } from '../paraglide/messages.js'
import { Button } from './ui/Button'
import { Card, CardTitle } from './ui/Card'
import { PlayIcon } from './ui/PlayIcon'
import { SegmentedControl } from './ui/SegmentedControl'

const modeLabel: Record<CueMode, () => string> = {
  switch: m.cuesFollowSwitch,
  always: m.cuesAlways,
  off: m.cuesOff,
}

/** Each cue's name and when it sounds. */
const cueText: Record<Cue, { name: () => string; when: () => string }> = {
  start: { name: m.cueStart, when: m.cueStartWhen },
  send: { name: m.cueSend, when: m.cueSendWhen },
  cancel: { name: m.cueCancel, when: m.cueCancelWhen },
  reply: { name: m.cueReply, when: m.cueReplyWhen },
  error: { name: m.cueError, when: m.cueErrorWhen },
}

/** Whether the voice cues sound, through the silent switch or not, and each to try out. */
export function CuesCard() {
  const mode = useCueMode()
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>{m.settingsCues()}</CardTitle>
      <SegmentedControl
        label={m.settingsCues()}
        options={CUE_MODES.map((value) => ({ value, label: modeLabel[value]() }))}
        value={mode}
        onChange={setCueMode}
      />
      <p className="m-0 text-caption text-fg-muted">
        {mode === 'always'
          ? m.cuesAlwaysHint()
          : mode === 'off'
            ? m.cuesOffHint()
            : m.cuesSwitchHint()}
      </p>
      {mode !== 'off' && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {CUES.map((cue) => (
            <li key={cue} className="flex items-center gap-3">
              <Button
                variant="soft"
                className="size-touch px-0"
                aria-label={m.cueTry({ name: cueText[cue].name() })}
                onClick={() => playCue(cue)}
              >
                <PlayIcon className="size-5" />
              </Button>
              <span className="flex min-w-0 flex-col">
                <span className="font-extrabold">{cueText[cue].name()}</span>
                <span className="text-caption text-fg-muted">{cueText[cue].when()}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
