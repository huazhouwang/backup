import { describe, expect, it } from 'vitest'

import { FRESH_MS, mayApplyUpdate } from './auto-update'

const fresh = { visible: true, sinceFresh: 2_000, touched: false, busy: false }

describe('applying an update on its own', () => {
  it('happens just after the app opens or comes back, with nothing under way', () => {
    expect(mayApplyUpdate(fresh)).toBe(true)
  })

  it('waits once someone has started using the app, or a while has passed', () => {
    expect(mayApplyUpdate({ ...fresh, touched: true })).toBe(false)
    expect(mayApplyUpdate({ ...fresh, sinceFresh: FRESH_MS })).toBe(false)
  })

  it('waits while something a reload would cut short is under way, or the app is hidden', () => {
    expect(mayApplyUpdate({ ...fresh, busy: true })).toBe(false)
    expect(mayApplyUpdate({ ...fresh, visible: false })).toBe(false)
  })
})
