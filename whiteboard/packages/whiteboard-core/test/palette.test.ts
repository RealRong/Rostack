import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  WHITEBOARD_PALETTE_KEYS,
  WHITEBOARD_PALETTE_REGISTRY,
  WHITEBOARD_STICKY_DEFAULTS,
  WHITEBOARD_STICKY_TONE_PRESETS,
  isWhiteboardPaletteKey,
  parseWhiteboardPaletteKey,
  resolveWhiteboardPaletteValue
} from '@whiteboard/core/palette'

test('sticky palette keys are first-class palette values', () => {
  const key = WHITEBOARD_PALETTE_KEYS.sticky[13]

  assert.equal(isWhiteboardPaletteKey(key), true)
  assert.deepEqual(parseWhiteboardPaletteKey(key), {
    group: 'sticky',
    index: 13
  })
  assert.equal(
    resolveWhiteboardPaletteValue(key),
    'var(--wb-palette-sticky-13)'
  )
})

test('sticky palette registry exposes 30 fill swatches', () => {
  assert.equal(WHITEBOARD_PALETTE_REGISTRY.sticky.length, 30)
  assert.equal(WHITEBOARD_PALETTE_KEYS.sticky.length, 30)
  assert.equal(WHITEBOARD_PALETTE_KEYS.sticky[0], 'palette:sticky:0')
  assert.equal(WHITEBOARD_PALETTE_KEYS.sticky[29], 'palette:sticky:29')
})

test('sticky defaults and insert tone presets use sticky fill keys instead of bg keys', () => {
  assert.equal(WHITEBOARD_STICKY_DEFAULTS.fill, 'palette:sticky:13')
  assert.ok(
    WHITEBOARD_STICKY_TONE_PRESETS.every((preset) => preset.fillKey.startsWith('palette:sticky:'))
  )
})
