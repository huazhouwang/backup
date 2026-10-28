import { Card, CardTitle } from '@lullabo/ui/card'
import { SegmentedControl } from '@lullabo/ui/segmented-control'

import { CUE_MODES, type CueMode, setCueMode, useCueMode } from '../../lib/cues'
import { m } from '../../paraglide/messages.js'

const modeLabel: Record<CueMode, () => string> = {
  switch: m.cuesFollowSwitch,
  always: m.cuesAlways,
  off: m.cuesOff,
}

const modeHint: Record<CueMode, () => string> = {
  switch: m.cuesSwitchHint,
  always: m.cuesAlwaysHint,
  off: m.cuesOffHint,
}

/** Whether the app's cues sound: following the silent switch, through it, or not at all. */
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
      <p className="m-0 text-caption text-muted-foreground">{modeHint[mode]()}</p>
    </Card>
  )
}
