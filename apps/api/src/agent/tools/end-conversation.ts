import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import type { ToolContext } from './shared'

/** Ends the conversation: the shortcut stops asking. */
export function endConversation(ctx: ToolContext) {
  return toolDefinition({
    name: 'end_conversation',
    description:
      'Call when the user is finished ("没有了", "好了", "谢谢") or nothing more can be done, ' +
      'then say a short goodbye.',
    inputSchema: z.object({}),
    outputSchema: z.object({ ended: z.boolean() }),
  }).server(async () => {
    ctx.state.done = true
    return { ended: true }
  })
}
