import {
  createWhiteboardPaletteKey
} from '@whiteboard/product/palette/key'

type WhiteboardDrawSlotPreset = {
  color: string
  width: number
}

export type WhiteboardDrawBrushPreset = {
  slot: '1' | '2' | '3'
  slots: Readonly<Record<'1' | '2' | '3', WhiteboardDrawSlotPreset>>
}

export const WHITEBOARD_DRAW_DEFAULTS: Readonly<Record<'pen' | 'highlighter', WhiteboardDrawBrushPreset>> = {
  pen: {
    slot: '1',
    slots: {
      '1': {
        color: createWhiteboardPaletteKey('border', 0),
        width: 2
      },
      '2': {
        color: createWhiteboardPaletteKey('border', 26),
        width: 4
      },
      '3': {
        color: createWhiteboardPaletteKey('border', 29),
        width: 8
      }
    }
  },
  highlighter: {
    slot: '1',
    slots: {
      '1': {
        color: createWhiteboardPaletteKey('border', 23),
        width: 12
      },
      '2': {
        color: createWhiteboardPaletteKey('border', 24),
        width: 12
      },
      '3': {
        color: createWhiteboardPaletteKey('border', 29),
        width: 12
      }
    }
  }
}
