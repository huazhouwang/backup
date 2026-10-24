/** One chat message: text, model reasoning, and tool calls with their results */
import type { UIMessage } from '@tanstack/ai-react';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { safeJson, titleOf, type ToolCallPart, type ToolResultPart } from './common';

type ToolState = 'input-streaming' | 'input-available' | 'approval-requested' | 'approval-responded' | 'output-available' | 'output-error' | 'output-denied';

function toolState(part: ToolCallPart, result: ToolResultPart | undefined): ToolState {
  if (result?.outcome === 'denied' || result?.outcome === 'cancelled') return 'output-denied';
  if (part.state === 'approval-requested') return 'approval-requested';
  if (result?.state === 'error' || part.state === 'error') return 'output-error';
  if (result || part.output !== undefined || part.state === 'complete') {
    const out = part.output ?? (typeof result?.content === 'string' ? safeJson(result.content) : null);
    return out && out.ok === false ? 'output-error' : 'output-available';
  }
  if (part.state === 'input-streaming' || part.state === 'awaiting-input') return 'input-streaming';
  return 'input-available';
}

export function MessageView({ msg, results, streaming }: { msg: UIMessage; results: Map<string, ToolResultPart>; streaming: boolean }) {
  return (
    <Message from={msg.role === 'user' ? 'user' : 'assistant'}>
      <MessageContent>
        {msg.parts.map((p, i) => {
          if (p.type === 'text')
            return msg.role === 'user' ? (
              <p key={i} className="whitespace-pre-wrap">
                {p.content}
              </p>
            ) : (
              <MessageResponse key={i}>{p.content}</MessageResponse>
            );
          if (p.type === 'image') {
            const src = p.source.type === 'data' ? `data:${p.source.mimeType};base64,${p.source.value}` : p.source.type === 'url' ? p.source.value : null;
            return src ? <img key={i} src={src} alt="" className="max-h-48 rounded-md border" /> : null;
          }
          if (p.type === 'thinking')
            return (
              <Reasoning key={i} isStreaming={streaming}>
                <ReasoningTrigger />
                <ReasoningContent>{p.content}</ReasoningContent>
              </Reasoning>
            );
          if (p.type === 'tool-call') {
            const r = results.get(p.id);
            const out = p.output ?? (r ? safeJson(typeof r.content === 'string' ? r.content : '') : undefined);
            return (
              <Tool key={i}>
                <ToolHeader type="dynamic-tool" toolName={p.name} title={titleOf(p.name)} state={toolState(p, r)} />
                <ToolContent>
                  <ToolInput input={p.input ?? safeJson(p.arguments)} />
                  {out !== undefined && <ToolOutput output={out} errorText={out?.ok === false ? out.error?.message : r?.error} />}
                </ToolContent>
              </Tool>
            );
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
}
