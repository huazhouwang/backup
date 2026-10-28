import { Hono } from 'hono'

import type { AgentTurn } from '../agent/scope'
import { REPLIES, stop, turn } from '../agent/turn'
import type { AppEnv } from '../types'
import { textSchema } from '../validation'
import { useToken } from '../voice/tokens'

/**
 * What the Siri shortcut calls, with its code instead of a session. Always answers 200 with
 * `{ ok, done, confirming, reply, next, end? }`: Shortcuts may not read the body of an error response,
 * which would leave Siri silent. The shortcut reads `reply` aloud and asks "还有吗？" until
 * `done`, which the agent sets when the user is finished, or the server when asking again
 * cannot help.
 */
export const siriRoutes = new Hono<AppEnv>().post('/', async (c) => {
  // `end` is there only when the conversation is over, so the shortcut ends on "has any
  // value", which needs nothing to compare: its If has lost compared text across iOS
  // versions. `next` is the older form, for shortcuts added before.
  const answer = (result: AgentTurn, ok: boolean) =>
    c.json({
      ok,
      ...result,
      next: result.done ? 'stop' : 'ask',
      ...(result.done ? { end: '1' } : {}),
    })
  const now = Date.now()
  const check = await useToken(c.env.DB, c.req.header('Authorization'), now)
  if (check.status === 'invalid') return answer(stop(REPLIES.invalidToken), false)
  if (check.status === 'limited') return answer(stop(REPLIES.limited), false)
  const burst = await c.env.VOICE_RATE_LIMIT?.limit({ key: check.token.id })
  if (burst && !burst.success) return answer(stop(REPLIES.slowDown), false)

  const body = textSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) {
    return answer({ reply: REPLIES.unclear, done: false, confirming: false }, false)
  }
  try {
    return answer(
      await turn(c.env, c.get('adapterFor'), check.token.userId, body.data.text, now),
      true,
    )
  } catch (error) {
    console.error('Voice command failed', error)
    return answer(stop(REPLIES.unavailable), false)
  }
})
