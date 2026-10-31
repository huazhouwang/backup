import { describe, expect, it } from 'vitest'

import { heardText, withoutLoops } from '../src/voice/transcribe'

describe('what a recording heard', () => {
  it('drops what Whisper made up from background noise', () => {
    // A real answer, then noise at the end heard as the question's word and a greeting.
    const heard = heardText({
      text: '母乳130毫升，奶粉。嗨！',
      segments: [
        { text: '母乳130毫升，', no_speech_prob: 0.02, avg_logprob: -0.25 },
        { text: '奶粉。', no_speech_prob: 0.71, avg_logprob: -0.94 },
        { text: '嗨！', no_speech_prob: 0.2, avg_logprob: -1.6 },
      ],
    })
    expect(heard).toBe('母乳130毫升，')
  })

  it('keeps every segment that was likely speech, and the text when there are none', () => {
    const segments = [
      { text: ' she had', no_speech_prob: 0.05, avg_logprob: -0.3 },
      { text: ' 120 ml', no_speech_prob: 0.6, avg_logprob: -0.4 },
    ]
    expect(heardText({ text: 'she had 120 ml', segments })).toBe('she had 120 ml')
    expect(heardText({ text: ' 换尿布了 ' })).toBe('换尿布了')
    expect(heardText({ text: '嗨', segments: [{ text: '嗨', avg_logprob: -2 }] })).toBe('')
  })
})

describe('a recording Whisper got stuck on', () => {
  it('loses the loop but keeps what was said, numbers included', () => {
    expect(
      heardText({
        text: '',
        segments: [
          {
            text: '喝了130的奶粉，智智智智智智智智智智智智',
            no_speech_prob: 0.1,
            avg_logprob: -0.3,
            compression_ratio: 3.1,
          },
        ],
      }),
    ).toBe('喝了130的奶粉，')
    expect(withoutLoops('哈哈哈哈哈你好 1111 毫升')).toBe('你好 1111 毫升')
    expect(withoutLoops('宝宝宝宝宝宝宝宝睡了')).toBe('睡了')
    // Said twice or three times, it stays.
    expect(withoutLoops('好好好，换尿布了')).toBe('好好好，换尿布了')
  })
})
