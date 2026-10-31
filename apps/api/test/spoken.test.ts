import { describe, expect, it } from 'vitest'

import { splitHeard, withHeard } from '../src/agent/spoken'

describe('a corrected spoken message', () => {
  it('keeps what was heard only when the correction changed the words', () => {
    expect(withHeard('大概三点半开始睡觉。', '大三年半开始睡觉')).toBe(
      '大概三点半开始睡觉。\n（语音原文：大三年半开始睡觉）',
    )
    // Punctuation, spacing and case alone are no change.
    expect(withHeard('喝了 120 毫升。', '喝了120毫升')).toBe('喝了 120 毫升。')
    expect(withHeard('She had 120 ml.', 'she had 120 ml')).toBe('She had 120 ml.')
  })

  it('reads a kept message back into its text and what was heard', () => {
    expect(splitHeard('大概三点半开始睡觉。\n（语音原文：大三年半开始睡觉）')).toEqual({
      text: '大概三点半开始睡觉。',
      heard: '大三年半开始睡觉',
    })
    expect(splitHeard('换尿布了')).toEqual({ text: '换尿布了' })
  })
})
