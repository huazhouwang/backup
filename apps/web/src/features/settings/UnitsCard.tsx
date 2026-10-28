import { Card, CardTitle } from '@lullabo/ui/card'
import { SegmentedControl } from '@lullabo/ui/segmented-control'

import { type Quantity, type UnitPreferences, setUnits, unitLabel, useUnits } from '../../lib/units'
import { m } from '../../paraglide/messages.js'

const rows: { [Q in Quantity]: { label: () => string; options: UnitPreferences[Q][] } } = {
  volume: { label: m.unitKindVolume, options: ['ml', 'oz'] },
  weight: { label: m.unitKindWeight, options: ['kg', 'lb'] },
  length: { label: m.unitKindLength, options: ['cm', 'in'] },
  temperature: { label: m.unitKindTemperature, options: ['c', 'f'] },
}

const quantities = ['volume', 'weight', 'length', 'temperature'] as const

/** Display units for amounts, measurements and temperature; stored records never change. */
export function UnitsCard() {
  const units = useUnits()
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>{m.settingsUnits()}</CardTitle>
      {quantities.map((quantity) => (
        <SegmentedControl<string>
          key={quantity}
          labelStyle="caption"
          label={rows[quantity].label()}
          options={rows[quantity].options.map((unit) => ({
            value: unit,
            label: unitLabel(quantity, { ...units, [quantity]: unit }),
          }))}
          value={units[quantity]}
          onChange={(unit) => setUnits({ ...units, [quantity]: unit })}
        />
      ))}
      <p className="m-0 text-caption text-muted-foreground">{m.settingsUnitsHint()}</p>
    </Card>
  )
}
