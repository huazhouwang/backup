import { describe, expect, it } from 'vitest'

import { recentContext } from './conversation'

describe('recentContext', () => {
  it('gives the last four messages, each marked by who said it', () => {
    const lines = ['a', 'b', 'c', 'd', 'e'].map((text, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text,
    }))
    expect(recentContext(lines)).toEqual(['Assistant: b', 'User: c', 'Assistant: d', 'User: e'])
  })
})
