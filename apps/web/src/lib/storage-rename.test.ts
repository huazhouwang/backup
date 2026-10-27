import { describe, expect, it } from 'vitest'

import { renameStoredKeys, storageRenameScript } from './storage-rename'

/** A browser's localStorage, in memory. */
function memoryStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries))
  return {
    get length() {
      return map.size
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
  }
}

describe('moving settings from the old name', () => {
  it('moves bobo.* keys and the saved queries to the new names', () => {
    const storage = memoryStorage({
      'bobo.theme': 'dark',
      'bobo.seenBadges.b1': '["first"]',
      'bobo-queries': '{}',
      other: 'kept',
    })
    renameStoredKeys(storage)
    expect(storage.getItem('lullabo.theme')).toBe('dark')
    expect(storage.getItem('lullabo.seenBadges.b1')).toBe('["first"]')
    expect(storage.getItem('lullabo-queries')).toBe('{}')
    expect(storage.getItem('bobo.theme')).toBeNull()
    expect(storage.getItem('bobo-queries')).toBeNull()
    expect(storage.getItem('other')).toBe('kept')
  })

  it('keeps a value already saved under the new name', () => {
    const storage = memoryStorage({ 'lullabo.units': 'imperial', 'bobo.units': 'metric' })
    renameStoredKeys(storage)
    expect(storage.getItem('lullabo.units')).toBe('imperial')
    expect(storage.getItem('bobo.units')).toBeNull()
  })

  it('runs as an inline script on localStorage, guarded', () => {
    expect(storageRenameScript).toMatch(/^\(function\(\)\{try\{\(/)
    expect(storageRenameScript).toContain('(localStorage)}catch(e){}')
  })
})
