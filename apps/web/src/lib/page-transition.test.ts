import { describe, expect, it } from 'vitest'

import { pageTransition } from './page-transition'

describe('pageTransition', () => {
  it('fades between tabs', () => {
    expect(pageTransition('/', '/settings')).toBe('tab')
    expect(pageTransition('/stats', '/')).toBe('tab')
  })

  it('slides into deeper pages and back out', () => {
    expect(pageTransition('/settings', '/settings/about')).toBe('forward')
    expect(pageTransition('/settings/family/abc', '/settings')).toBe('back')
    expect(pageTransition('/settings/about', '/')).toBe('back')
  })

  it('fades between sibling sub-pages', () => {
    expect(pageTransition('/settings/about', '/settings/export')).toBe('tab')
  })

  it('slides the chat up over the app, and back down', () => {
    expect(pageTransition('/', '/chat')).toBe('up')
    expect(pageTransition('/settings/voice', '/chat')).toBe('up')
    expect(pageTransition('/chat', '/')).toBe('down')
  })
})
