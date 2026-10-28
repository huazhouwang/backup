import { describe, expect, it } from 'vitest'

import { replyLanguage } from '../src/agent/prompt'
import { withoutThinking } from '../src/agent/text'

describe('replies', () => {
  it('drop the thinking some hosts leave in the text', () => {
    expect(withoutThinking('<think>用户换了尿布。</think>好，记好了。')).toBe('好，记好了。')
    // The opening tag was dropped by the host.
    expect(withoutThinking('Need record diaper.</think>好，记好了。')).toBe('好，记好了。')
    // Cut off while still thinking: nothing to say yet.
    expect(withoutThinking('<think>Need record')).toBe('')
    expect(withoutThinking('好，记好了。还有吗？')).toBe('好，记好了。还有吗？')
  })

  it('name the language to reply in, whatever the region', () => {
    expect(replyLanguage('zh-CN')).toBe('中文')
    expect(replyLanguage('zh-TW')).toBe('中文')
    expect(replyLanguage('en-US')).toBe('英语')
    expect(replyLanguage('not a locale')).toBe('中文')
  })
})
