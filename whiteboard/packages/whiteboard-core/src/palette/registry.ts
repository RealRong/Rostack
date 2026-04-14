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
  border: range(0, 29),
  text: range(0, 19)
}

export const WHITEBOARD_BG_PALETTE_INDICES = WHITEBOARD_PALETTE_REGISTRY.bg
export const WHITEBOARD_BORDER_PALETTE_INDICES = WHITEBOARD_PALETTE_REGISTRY.border
export const WHITEBOARD_TEXT_PALETTE_INDICES = WHITEBOARD_PALETTE_REGISTRY.text

export const WHITEBOARD_PALETTE_KEYS: Readonly<Record<
  WhiteboardPaletteGroup,
  readonly WhiteboardPaletteKey[]
>> = {
  bg: WHITEBOARD_BG_PALETTE_INDICES.map((index) => createWhiteboardPaletteKey('bg', index)),
  border: WHITEBOARD_BORDER_PALETTE_INDICES.map((index) => createWhiteboardPaletteKey('border', index)),
  text: WHITEBOARD_TEXT_PALETTE_INDICES.map((index) => createWhiteboardPaletteKey('text', index))
}
