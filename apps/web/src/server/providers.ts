/** LLM providers users can choose. Adapters come from TanStack AI; this only lists metadata and suggested models. */
import { m } from '@/lib/i18n';

export interface ProviderInfo {
  name: string;
  models: string[];
  needsBaseUrl?: boolean;
  hint: string;
}

/** Display name and hint are message lookups so they follow the request's language */
interface ProviderDef extends Omit<ProviderInfo, 'name' | 'hint'> {
  name: () => string;
  hint: () => string;
}

export const PROVIDERS: Record<string, ProviderDef> = {
  anthropic: { name: () => 'Anthropic', models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'], hint: m.server_provider_anthropic_hint },
  openai: { name: () => 'OpenAI', models: ['gpt-5.5', 'gpt-5', 'gpt-4.1'], hint: m.server_provider_openai_hint },
  gemini: { name: () => 'Google Gemini', models: ['gemini-2.5-pro', 'gemini-2.5-flash'], hint: m.server_provider_gemini_hint },
  openrouter: {
    name: () => 'OpenRouter',
    models: ['anthropic/claude-sonnet-5.5', 'deepseek/deepseek-v4-pro', 'qwen/qwen3-max'],
    hint: m.server_provider_openrouter_hint,
  },
  compatible: { name: m.server_provider_compatible_name, models: ['deepseek-chat', 'qwen-max'], needsBaseUrl: true, hint: m.server_provider_compatible_hint },
};

/** Provider list for the Settings page, in the current request's language */
export const localizedProviders = (): Record<string, ProviderInfo> =>
  Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, { ...p, name: p.name(), hint: p.hint() }]));
