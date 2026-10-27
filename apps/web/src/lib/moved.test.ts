import { describe, expect, it } from 'vitest'

import { movedTo } from './moved'

const at = (url: string) => {
  const { origin, pathname, search, hash } = new URL(url)
  return { origin, pathname, search, hash }
}

describe('movedTo', () => {
  it('points the same page at the app’s own address', () => {
    expect(movedTo('https://lullabo.example.com', at('https://bobo.example.com/tips?x=1#a'))).toBe(
      'https://lullabo.example.com/tips?x=1#a',
    )
  })

  it('stays put at the app’s own address, or when none is set', () => {
    expect(
      movedTo('https://lullabo.example.com/', at('https://lullabo.example.com/tips')),
    ).toBeNull()
    expect(movedTo('', at('http://localhost:4173/'))).toBeNull()
  })
})
