import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import type { MemberRole } from '@lullabo/shared'
import { cn } from '@lullabo/ui/utils'
import { useId } from 'react'

import { m } from '../../paraglide/messages.js'
import { roleHint, roleLabel } from './roles'

/** Role cards with a one-line explanation of what each role may do. */
export function RolePicker({
  roles,
  value,
  onChange,
}: {
  roles: MemberRole[]
  value: MemberRole
  onChange: (role: MemberRole) => void
}) {
  const legendId = useId()
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend id={legendId} className="mb-2 font-bold">
        {m.inviteRoleLabel()}
      </legend>
      <RadioGroup
        aria-labelledby={legendId}
        value={value}
        onValueChange={onChange}
        className="flex flex-col gap-2"
      >
        {roles.map((role) => (
          <label
            key={role}
            className={cn(
              'flex min-h-touch cursor-pointer flex-col rounded-xl border-2 px-3 py-2',
              value === role ? 'border-diaper bg-diaper-soft' : 'border-border',
            )}
          >
            <Radio.Root value={role} className="sr-only" />
            <span className="font-extrabold">{roleLabel[role]()}</span>
            <span className="text-caption text-muted-foreground">{roleHint[role]()}</span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  )
}
