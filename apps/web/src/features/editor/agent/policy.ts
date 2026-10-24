/** Which capabilities need the homeowner's confirmation: one rule set shared by the server (tool definitions) and the browser (confirmation cards) */
import type { Capability, Permission } from '@plinth/core';

export type Autonomy = 'ask' | 'balanced' | 'auto';

export const NEEDS_APPROVAL: Record<Autonomy, Permission[]> = {
  ask: ['reversible', 'main', 'external'],
  balanced: ['main', 'external'],
  auto: ['external'],
};

export const needsApproval = (c: Capability, autonomy: Autonomy) => NEEDS_APPROVAL[autonomy].includes(c.permission) && c.kind !== 'query' && c.kind !== 'view';

export const isAutonomy = (v: unknown): v is Autonomy => v === 'ask' || v === 'balanced' || v === 'auto';
