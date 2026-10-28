import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { FamilyAccess } from '../src/access'
import { instructions } from '../src/agent/prompt'
import type { AgentScope } from '../src/agent/scope'
import { agentTools } from '../src/agent/tools'

// The text the model is given, pinned: moving code around must not change a character of it.

const NOW = Date.UTC(2026, 9, 17, 2, 0)

const family = (overrides: Partial<FamilyAccess> = {}): FamilyAccess => ({
  id: 'family-1',
  name: '我们家',
  role: 'owner',
  babyIds: null,
  alias: null,
  memberCount: 2,
  ...overrides,
})

const scope = (overrides: Partial<AgentScope> = {}): AgentScope => ({
  // The instructions and tool definitions never touch the database.
  db: null as unknown as D1Database,
  access: new Map(),
  families: [family()],
  sharedOnly: false,
  keyScope: 'own',
  userId: 'user-1',
  timeZone: 'Asia/Shanghai',
  locale: 'zh-CN',
  phrase: '记录宝宝',
  ...overrides,
})

const BABIES = [
  '小米粒（我们家）：女孩，2 个月 7 天。参考：每次 90–150 毫升。最近 7 天：瓶喂每天 6 次。',
  '大米粒（我们家）：男孩，2 岁 1 个月。',
]

describe('the system prompt', () => {
  it('for the user’s own key, with babies, in Chinese', () => {
    expect(instructions(scope(), NOW, BABIES)).toMatchSnapshot()
  })

  it('for a family’s shared key, in English, asked from a tip, with no babies', () => {
    const shared = scope({
      families: [family({ alias: '姥姥家' })],
      sharedOnly: true,
      locale: 'en-US',
      timeZone: 'America/New_York',
      tip: 'safe-sleep',
    })
    expect(instructions(shared, NOW, [])).toMatchSnapshot()
  })

  it('for a shared key without an alias, an unknown tip and an unreadable locale', () => {
    const shared = scope({ sharedOnly: true, locale: 'not a locale', tip: 'no-such-tip' })
    expect(instructions(shared, NOW, BABIES.slice(0, 1))).toMatchSnapshot()
  })
})

describe('the tool definitions', () => {
  it('keep their names, descriptions and schemas', () => {
    const tools = agentTools({
      ...scope(),
      threadId: 'thread-1',
      runId: 'run-1',
      now: NOW,
      state: { done: false, saved: [] },
    })
    const definitions = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      needsApproval: tool.needsApproval ?? false,
      inputSchema: z.toJSONSchema(tool.inputSchema as z.ZodType),
      outputSchema: z.toJSONSchema(tool.outputSchema as z.ZodType),
    }))
    expect(definitions).toMatchSnapshot()
  })
})
