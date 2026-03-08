import { describe, expect, it } from 'vitest'

import { shortenHash } from '../../src/components'

describe('shortenHash', () => {
  it('returns the original value when it is already short enough', () => {
    expect(shortenHash('0x1234', 4)).toBe('0x1234')
  })

  it('keeps both ends of long hashes with an ellipsis in the middle', () => {
    expect(shortenHash('0x1234567890abcdef', 4)).toBe('0x12…cdef')
  })
})
