/**
 * Moves this browser's settings from the keys the app used as Bobo (`bobo.*`, and the
 * saved queries) to Lullabo's; a value already under the new key wins. Self-contained,
 * as it also runs as an inline head script.
 */
export function renameStoredKeys(storage: Storage) {
  for (let i = storage.length - 1; i >= 0; i -= 1) {
    const key = storage.key(i)
    const renamed = key?.startsWith('bobo.')
      ? `lullabo.${key.slice('bobo.'.length)}`
      : key === 'bobo-queries'
        ? 'lullabo-queries'
        : null
    if (key && renamed) {
      const value = storage.getItem(key)
      if (storage.getItem(renamed) === null && value !== null) storage.setItem(renamed, value)
      storage.removeItem(key)
    }
  }
}

/** Runs before anything reads the settings, so the theme already finds its own. */
export const storageRenameScript = `(function(){try{(${renameStoredKeys.toString()})(localStorage)}catch(e){}})()`
