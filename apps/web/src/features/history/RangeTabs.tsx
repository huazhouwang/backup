import { HISTORY_RANGES, type HistoryRange } from '@folio/shared'
import { Tabs, TabsList, TabsTrigger } from '@folio/ui/components/motion/tabs'

import { m } from '../../paraglide/messages.js'

const LABEL: Record<HistoryRange, () => string> = {
  '7d': m.range7d,
  '30d': m.range30d,
  '90d': m.range90d,
  '1y': m.range1y,
  all: m.rangeAll,
}

export function RangeTabs({
  value,
  onChange,
}: {
  value: HistoryRange
  onChange: (range: HistoryRange) => void
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(HISTORY_RANGES.find((range) => range === next) ?? '30d')}
      variant="segment"
    >
      <TabsList>
        {HISTORY_RANGES.map((range) => (
          <TabsTrigger key={range} value={range}>
            {LABEL[range]()}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
