import { deleteEvent } from './delete-event'
import { endConversation } from './end-conversation'
import { findEvents } from './find-events'
import { listBabies } from './list-babies'
import { readTips } from './read-tips'
import { record } from './record'
import { type AgentContext, toolContext } from './shared'
import { undo } from './undo'
import { updateEvent } from './update-event'

/** The tools for one turn, bound to its context. */
export function agentTools(agent: AgentContext) {
  const ctx = toolContext(agent)
  return [
    listBabies(ctx),
    findEvents(ctx),
    record(ctx),
    updateEvent(ctx),
    deleteEvent(ctx),
    undo(ctx),
    readTips(ctx),
    endConversation(ctx),
  ]
}
