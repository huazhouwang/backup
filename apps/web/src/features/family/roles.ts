import type { FamilyRole, MemberRole } from '@lullabo/shared'

import { m } from '../../paraglide/messages.js'

export const roleLabel: Record<FamilyRole, () => string> = {
  owner: m.roleOwner,
  admin: m.roleAdmin,
  caregiver: m.roleCaregiver,
  viewer: m.roleViewer,
}

export const roleHint: Record<MemberRole, () => string> = {
  admin: m.roleAdminHint,
  caregiver: m.roleCaregiverHint,
  viewer: m.roleViewerHint,
}
