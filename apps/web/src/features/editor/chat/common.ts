import { capabilityTitle } from '@plinth/core';
import type { UIMessage } from '@tanstack/ai-react';
import { registry } from '@/features/editor/agent/registry';

export type Part = UIMessage['parts'][number];
export type ToolCallPart = Extract<Part, { type: 'tool-call' }>;
export type ToolResultPart = Extract<Part, { type: 'tool-result' }>;

/** Capability title in the UI language */
export function titleOf(name: string) {
  const c = registry.get(name);
  return c ? capabilityTitle(c) : name;
}

export const safeJson = (s: string): any => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};
