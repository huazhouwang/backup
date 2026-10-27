import { afterEach, describe, expect, it, vi } from 'vitest';
import { localKey, readLocal } from './local';

describe('local storage keys', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads opensu.* first and still reads values saved as plinth.* before the rename (issue 179)', () => {
    const store = new Map<string, string>([['plinth.autonomy', 'auto']]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null });
    expect(localKey('autonomy')).toBe('opensu.autonomy');
    expect(readLocal('autonomy')).toBe('auto');
    store.set('opensu.autonomy', 'ask');
    expect(readLocal('autonomy')).toBe('ask');
    expect(readLocal('missing')).toBeNull();
  });
});
