import type { MemberRole } from '@lullabo/shared'
import { clsx } from 'clsx'

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
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-2 font-bold">{m.inviteRoleLabel()}</legend>
      {roles.map((role) => (
        <label
          key={role}
          className={clsx(
            'flex min-h-touch cursor-pointer flex-col rounded-xl border-2 px-3 py-2',
            value === role ? 'border-diaper bg-diaper-soft' : 'border-border',
          )}
        >
          <input
            type="radio"
            className="sr-only"
            checked={value === role}
            onChange={() => onChange(role)}
          />
          <span className="font-extrabold">{roleLabel[role]()}</span>
          <span className="text-caption text-fg-muted">{roleHint[role]()}</span>
        </label>
      ))}
    </fieldset>
  )
}
