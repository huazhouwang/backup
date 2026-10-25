import { Navigate, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { ChatPage } from '../features/voice/ChatPage'
import { useAccess } from '../sync/use-access'

const searchSchema = z.object({
  /** Opened to say something: the field takes the focus, and the keyboard comes up. */
  say: z.boolean().optional().catch(undefined),
})

export const Route = createFileRoute('/chat')({
  validateSearch: searchSchema,
  component: Chat,
})

/** Talking to the assistant: signed-in users only, as what it records goes to the server. */
function Chat() {
  const { say } = Route.useSearch()
  const { userId } = useAccess()
  if (!userId) return <Navigate to="/" replace />
  return <ChatPage focus={say === true} />
}
