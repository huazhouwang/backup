import { FormError } from '@lullabo/ui/form-error'
import { Input } from '@lullabo/ui/input'

import { formatQuantity, quantityInputProps, unitLabel } from '../../../lib/units'
import { m } from '../../../paraglide/messages.js'
import { mixedTotal } from './bottle-input'

/** Breast milk and formula amounts of a mixed bottle, with their total. */
export function MixedAmounts({
  breast,
  formula,
  error,
  onBreast,
  onFormula,
}: {
  breast: string
  formula: string
  error?: string
  onBreast: (value: string) => void
  onFormula: (value: string) => void
}) {
  const unit = unitLabel('volume')
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={m.mixedBreastMl({ unit })}
          {...quantityInputProps('volume')}
          min={0}
          value={breast}
          onChange={(event) => onBreast(event.target.value)}
        />
        <Input
          label={m.mixedFormulaMl({ unit })}
          {...quantityInputProps('volume')}
          min={0}
          value={formula}
          onChange={(event) => onFormula(event.target.value)}
        />
      </div>
      <p className="m-0 font-bold tabular-nums">
        {m.mixedTotal({
          amount: formatQuantity('volume', mixedTotal({ breast, formula })),
          unit,
        })}
      </p>
      {error && <FormError size="caption">{error}</FormError>}
    </div>
  )
}
