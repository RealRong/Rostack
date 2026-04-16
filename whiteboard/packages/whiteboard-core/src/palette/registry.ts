import {
  createWhiteboardPaletteKey,
  type WhiteboardPaletteGroup,
  type WhiteboardPaletteKey
} from '@whiteboard/core/palette/schema'

const range = (
  start: number,
  end: number
) => Array.from({
  length: end - start + 1
}, (_, index) => start + index)

export type WhiteboardPaletteRegistry = Readonly<Record<
  WhiteboardPaletteGroup,
  readonly number[]
>>

export const WHITEBOARD_PALETTE_REGISTRY: WhiteboardPaletteRegistry = {
  bg: range(0, 28),
  sticky: range(0, 29),
  border: range(0, 29),
  text: range(0, 19),
  line: range(0, 29)
}

export const WHITEBOARD_BG_PALETTE_INDICES = WHITEBOARD_PALETTE_REGISTRY.bg
export const WHITEBOARD_STICKY_PALETTE_INDICES = WHITEBOARD_PALETTE_REGISTRY.sticky
export const WHITEBOARD_BORDER_PALETTE_INDICES = WHITEBOARD_PALETTE_REGISTRY.border
export const WHITEBOARD_TEXT_PALETTE_INDICES = WHITEBOARD_PALETTE_REGISTRY.text
export const WHITEBOARD_LINE_PALETTE_INDICES = WHITEBOARD_PALETTE_REGISTRY.line

export const WHITEBOARD_PALETTE_KEYS: Readonly<Record<
  WhiteboardPaletteGroup,
  readonly WhiteboardPaletteKey[]
>> = {
  bg: WHITEBOARD_BG_PALETTE_INDICES.map((index) => createWhiteboardPaletteKey('bg', index)),
  sticky: WHITEBOARD_STICKY_PALETTE_INDICES.map((index) => createWhiteboardPaletteKey('sticky', index)),
  border: WHITEBOARD_BORDER_PALETTE_INDICES.map((index) => createWhiteboardPaletteKey('border', index)),
  text: WHITEBOARD_TEXT_PALETTE_INDICES.map((index) => createWhiteboardPaletteKey('text', index)),
  line: WHITEBOARD_LINE_PALETTE_INDICES.map((index) => createWhiteboardPaletteKey('line', index))
}
