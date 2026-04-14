import { describe, expect, it } from 'vitest'
import {
  WHITEBOARD_FILL_COLOR_OPTIONS,
  WHITEBOARD_STICKY_FILL_OPTIONS
} from '../src/features/palette'

describe('sticky fill palette', () => {
  it('exposes the full 30-color sticky fill palette in the toolbar', () => {
    expect(WHITEBOARD_STICKY_FILL_OPTIONS).toHaveLength(30)
    expect(WHITEBOARD_STICKY_FILL_OPTIONS[0]?.value).toBe('palette:sticky:0')
    expect(WHITEBOARD_STICKY_FILL_OPTIONS[29]?.value).toBe('palette:sticky:29')
  })

  it('does not reuse bg palette keys for sticky fill options', () => {
    expect(
      WHITEBOARD_STICKY_FILL_OPTIONS.every((option) => option.value.startsWith('palette:sticky:'))
    ).toBe(true)

    const bgValues = new Set(
      WHITEBOARD_FILL_COLOR_OPTIONS.map((option) => option.value)
    )

    expect(
      WHITEBOARD_STICKY_FILL_OPTIONS.some((option) => bgValues.has(option.value))
    ).toBe(false)
  })
})
