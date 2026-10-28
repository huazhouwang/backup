/** A model that writes its tool calls as text (DeepSeek's DSML) instead of calling them. */
export const RAW_TOOL_CALL = /｜DSML｜|<\|tool|<\/?(invoke|function_calls|tool_call)\b/

/**
 * The reply without a model's thinking: `<think>…</think>` blocks, and everything before a
 * `</think>` whose opening tag the host dropped. Other models keep their thinking out of the
 * reply on their own (reasoning effort, see modelOptionsFor).
 */
export function withoutThinking(text: string): string {
  const closed = text.replaceAll(/<think>[\s\S]*?<\/think>/g, '')
  const dangling = closed.lastIndexOf('</think>')
  const rest = dangling === -1 ? closed : closed.slice(dangling + '</think>'.length)
  return rest.replace(/<think>[\s\S]*$/, '').trim()
}
