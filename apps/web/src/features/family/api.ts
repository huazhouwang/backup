import type {
  CreateInviteRequest,
  FamilyMember,
  FamilyRole,
  Invite,
  InvitePreview,
} from '@lullabo/shared'

import { apiFetch } from '../../lib/api'

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
})
const familyPath = (familyId: string) => `/api/families/${encodeURIComponent(familyId)}`

export const familyApi = {
  members: (familyId: string) => apiFetch<FamilyMember[]>(`${familyPath(familyId)}/members`),
  updateMember: (
    familyId: string,
    userId: string,
    body: { role?: Exclude<FamilyRole, 'owner'>; babyIds?: string[] | null },
  ) =>
    apiFetch<void>(
      `${familyPath(familyId)}/members/${encodeURIComponent(userId)}`,
      json('PATCH', body),
    ),
  removeMember: (familyId: string, userId: string) =>
    apiFetch<void>(`${familyPath(familyId)}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),
  rename: (familyId: string, name: string) =>
    apiFetch<void>(familyPath(familyId), json('PATCH', { name })),
  setAlias: (familyId: string, alias: string) =>
    apiFetch<void>(`${familyPath(familyId)}/alias`, json('PUT', { alias })),
  remove: (familyId: string) => apiFetch<void>(familyPath(familyId), { method: 'DELETE' }),
  transfer: (familyId: string, userId: string) =>
    apiFetch<void>(`${familyPath(familyId)}/transfer`, json('POST', { userId })),
  createInvite: (familyId: string, body: CreateInviteRequest) =>
    apiFetch<Invite>(`${familyPath(familyId)}/invites`, json('POST', body)),
  invites: (familyId: string) => apiFetch<Invite[]>(`${familyPath(familyId)}/invites`),
  revokeInvite: (familyId: string, code: string) =>
    apiFetch<void>(`${familyPath(familyId)}/invites/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    }),
  previewInvite: (code: string) =>
    apiFetch<InvitePreview>(`/api/invites/${encodeURIComponent(code)}`),
  acceptInvite: (code: string) =>
    apiFetch<{ familyId: string }>(`/api/invites/${encodeURIComponent(code)}/accept`, {
      method: 'POST',
    }),
}

export function inviteUrl(code: string): string {
  return new URL(`/join/${code}`, window.location.origin).toString()
}
