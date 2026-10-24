/** Project roles, shared by the Worker (permission checks) and the SPA (what to show). */

export const ROLES = ['viewer', 'commenter', 'editor', 'owner'] as const;
export type Role = (typeof ROLES)[number];

/** Roles that can be granted through share links, invites and member changes */
export const SHARE_ROLES = ['viewer', 'commenter', 'editor'] as const satisfies readonly Role[];
export type ShareRole = (typeof SHARE_ROLES)[number];

/** Position in ROLES: each role can do everything the ones before it can */
export const ROLE_RANK = Object.fromEntries(ROLES.map((r, i) => [r, i])) as Record<Role, number>;

/** Whether the role is at least `min` (no role: never) */
export const can = (role: Role | null | undefined, min: Role) => !!role && ROLE_RANK[role] >= ROLE_RANK[min];
