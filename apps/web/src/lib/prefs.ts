/** Local preferences (this browser only): agent autonomy level, the model picked in each project's chat */
import type { Autonomy } from '@/features/editor/agent/policy';
import { m } from './i18n';
import { localKey, readLocal } from './local';

const KEY = 'autonomy';
export const AUTONOMIES: Autonomy[] = ['ask', 'balanced', 'auto'];
const AUTONOMY_TEXT: Record<Autonomy, { label: () => string; hint: () => string }> = {
  ask: { label: m.autonomy_ask, hint: m.autonomy_ask_hint },
  balanced: { label: m.autonomy_balanced, hint: m.autonomy_balanced_hint },
  auto: { label: m.autonomy_auto, hint: m.autonomy_auto_hint },
};
export const autonomyLabel = (a: Autonomy) => AUTONOMY_TEXT[a].label();
export const autonomyHint = (a: Autonomy) => AUTONOMY_TEXT[a].hint();

export function getAutonomy(): Autonomy {
  try {
    const v = readLocal(KEY);
    if (v === 'ask' || v === 'balanced' || v === 'auto') return v;
  } catch {}
  return 'balanced';
}

export function setAutonomy(v: Autonomy) {
  try {
    localStorage.setItem(localKey(KEY), v);
  } catch {}
}

const chatModelKey = (projectId: string) => `chat-model.${projectId}`;

/** The model picked in a project's chat; null follows the project's model */
export function getChatModel(projectId: string): string | null {
  try {
    return readLocal(chatModelKey(projectId));
  } catch {
    return null;
  }
}

export function setChatModel(projectId: string, modelId: string | null) {
  try {
    if (modelId) localStorage.setItem(localKey(chatModelKey(projectId)), modelId);
    else localStorage.removeItem(localKey(chatModelKey(projectId)));
    localStorage.removeItem(`plinth.${chatModelKey(projectId)}`);
  } catch {}
}
