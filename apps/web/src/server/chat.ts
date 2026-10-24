/**
 * Agent chat via TanStack AI. All capabilities are client-side tools (executed in the browser that has the project open);
 * the server only calls the LLM with the project's configured key, streams the reply, and records usage.
 */
import { chat, chatParamsFromRequestBody, maxIterations, toolDefinition, toServerSentEventsResponse, type ChatMiddleware } from '@tanstack/ai';
import { createAnthropicChat } from '@tanstack/ai-anthropic';
import { createGeminiChat } from '@tanstack/ai-gemini';
import { createOpenaiChat } from '@tanstack/ai-openai';
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible';
import { createOpenRouterText } from '@tanstack/ai-openrouter';
import { isAutonomy, needsApproval, type Autonomy } from '../features/editor/agent/policy';
import { registry } from '../features/editor/agent/registry';
import { SYSTEM_PROMPT, contextPrompt, type AgentContext } from '../features/editor/agent/prompt';
import { m } from '@/lib/i18n';
import type { ModelWithKey } from './repo';

export type { Autonomy };

/** Rarely used capabilities are lazy-loaded to save tokens */
const LAZY = new Set(['history_log', 'search_capabilities', 'constraint_remove', 'wall_update', 'space_merge', 'space_remove', 'list_constraints']);

export function agentTools(autonomy: Autonomy) {
  return registry.list().map(c =>
    toolDefinition({
      name: c.name,
      description: `${c.title}: ${c.description}`,
      inputSchema: c.input,
      needsApproval: needsApproval(c, autonomy),
      lazy: LAZY.has(c.name),
    }),
  );
}

function adapter(cfg: ModelWithKey, apiKey: string) {
  const model = cfg.model as never;
  switch (cfg.provider) {
    case 'anthropic':
      return createAnthropicChat(model, apiKey);
    case 'openai':
      return createOpenaiChat(model, apiKey);
    case 'gemini':
      return createGeminiChat(model, apiKey);
    case 'openrouter':
      return createOpenRouterText(model, apiKey);
    case 'compatible':
      return openaiCompatibleText(cfg.model, { baseURL: cfg.base_url!, apiKey });
    default:
      throw new Error(m.server_err_unsupported_provider({ provider: cfg.provider }));
  }
}

/** The model to call and how to record its usage; resolved from the model the user picked in the chat (if any) */
export interface ChatModel {
  config: ModelWithKey;
  apiKey: string;
  onUsage: (input: number, output: number) => Promise<unknown>;
}

export async function handleChat(request: Request, resolve: (modelId: string | undefined) => Promise<ChatModel>) {
  let params;
  try {
    params = await chatParamsFromRequestBody(await request.json());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : m.server_err_bad_request() }, { status: 400 });
  }
  const props = params.forwardedProps as { autonomy?: Autonomy; context?: AgentContext; modelId?: unknown };
  const autonomy: Autonomy = isAutonomy(props.autonomy) ? props.autonomy : 'balanced';
  const o = await resolve(typeof props.modelId === 'string' ? props.modelId : undefined);

  let input = 0,
    output = 0;
  const usage: ChatMiddleware = {
    name: 'usage',
    onUsage(_ctx, u) {
      input += u.promptTokens ?? 0;
      output += u.completionTokens ?? 0;
    },
    onFinish: async () => void (await o.onUsage(input, output)),
    onAbort: async () => void (await o.onUsage(input, output)),
    onError: async () => void (await o.onUsage(input, output)),
  };

  const abortController = new AbortController();
  request.signal.addEventListener('abort', () => abortController.abort());
  // The provider is only known at runtime, so type the adapter loosely
  const options: any = {
    adapter: adapter(o.config, o.apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    systemPrompts: [SYSTEM_PROMPT, contextPrompt(props.context)],
    tools: agentTools(autonomy),
    agentLoopStrategy: maxIterations(40),
    lazyToolsConfig: { includeDescription: 'first-sentence' },
    middleware: [usage],
    abortController,
    ...(params.resume ? { resume: params.resume, parentRunId: params.parentRunId } : {}),
    ...(o.config.provider === 'anthropic' ? { modelOptions: { max_tokens: 8192 } } : {}),
  };
  const stream = chat(options) as unknown as Parameters<typeof toServerSentEventsResponse>[0];
  return toServerSentEventsResponse(stream, { abortController });
}
