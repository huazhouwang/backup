import { describe, expect, it } from 'vitest'

import { DURATION_KINDS, RECORD_KINDS, type RecordKind } from './record-kinds'

describe('record kinds', () => {
  it('lists the duration kinds in RECORD_KINDS order', () => {
    const kinds = Object.keys(RECORD_KINDS) as RecordKind[]
    expect(DURATION_KINDS).toEqual(kinds.filter((kind) => RECORD_KINDS[kind].timing === 'duration'))
  })
})
