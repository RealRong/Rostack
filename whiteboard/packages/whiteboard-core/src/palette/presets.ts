import {
  createWhiteboardPaletteKey,
  resolveWhiteboardPaletteVariable,
  type WhiteboardPaletteKey
} from '@whiteboard/core/palette/schema'

export type WhiteboardPaintPreset = {
  fill?: string
  stroke?: string
  strokeWidth?: number
  color?: string
}

export type WhiteboardStickyTonePreset = {
  id: string
  fillKey: WhiteboardPaletteKey
  strokeKey: WhiteboardPaletteKey
}

type WhiteboardDrawSlotPreset = {
  color: WhiteboardPaletteKey
  width: number
}

type WhiteboardDrawBrushPreset = {
  slot: '1' | '2' | '3'
  slots: Readonly<Record<'1' | '2' | '3', WhiteboardDrawSlotPreset>>
}

export const WHITEBOARD_TEXT_DEFAULT_COLOR = createWhiteboardPaletteKey('text', 0)
export const WHITEBOARD_STROKE_DEFAULT_COLOR = createWhiteboardPaletteKey('border', 0)
export const WHITEBOARD_SURFACE_DEFAULT_FILL = createWhiteboardPaletteKey('bg', 7)

export const WHITEBOARD_STICKY_DEFAULTS: Readonly<Required<WhiteboardPaintPreset>> = {
  fill: createWhiteboardPaletteKey('bg', 12),
  stroke: createWhiteboardPaletteKey('border', 4),
  strokeWidth: 1,
  color: WHITEBOARD_TEXT_DEFAULT_COLOR
}

export const WHITEBOARD_FRAME_DEFAULTS: Readonly<Required<WhiteboardPaintPreset>> = {
  fill: 'transparent',
  stroke: createWhiteboardPaletteKey('border', 4),
  strokeWidth: 1,
  color: createWhiteboardPaletteKey('text', 4)
}

export const WHITEBOARD_SHAPE_DEFAULTS: Readonly<Required<WhiteboardPaintPreset>> = {
  fill: WHITEBOARD_SURFACE_DEFAULT_FILL,
  stroke: WHITEBOARD_STROKE_DEFAULT_COLOR,
  strokeWidth: 1,
  color: WHITEBOARD_TEXT_DEFAULT_COLOR
}

export const WHITEBOARD_SHAPE_PRESET_PAINTS = {
  default: {
    fill: WHITEBOARD_SHAPE_DEFAULTS.fill,
    stroke: WHITEBOARD_SHAPE_DEFAULTS.stroke,
    color: WHITEBOARD_SHAPE_DEFAULTS.color,
    previewFill: resolveWhiteboardPaletteVariable('bg', 7)
  },
  arrowSticker: {
    fill: createWhiteboardPaletteKey('bg', 25),
    stroke: createWhiteboardPaletteKey('border', 26),
    color: createWhiteboardPaletteKey('border', 26),
    previewFill: resolveWhiteboardPaletteVariable('bg', 25)
  },
  highlight: {
    fill: createWhiteboardPaletteKey('bg', 22),
    stroke: createWhiteboardPaletteKey('border', 23),
    color: WHITEBOARD_TEXT_DEFAULT_COLOR,
    previewFill: resolveWhiteboardPaletteVariable('bg', 12)
  }
} as const

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

export const WHITEBOARD_STICKY_TONE_PRESETS: readonly WhiteboardStickyTonePreset[] = [
  {
    id: '12',
    fillKey: createWhiteboardPaletteKey('bg', 12),
    strokeKey: createWhiteboardPaletteKey('border', 12)
  },
  {
    id: '14',
    fillKey: createWhiteboardPaletteKey('bg', 14),
    strokeKey: createWhiteboardPaletteKey('border', 14)
  },
  {
    id: '15',
    fillKey: createWhiteboardPaletteKey('bg', 15),
    strokeKey: createWhiteboardPaletteKey('border', 15)
  },
  {
    id: '18',
    fillKey: createWhiteboardPaletteKey('bg', 18),
    strokeKey: createWhiteboardPaletteKey('border', 19)
  },
  {
    id: '22',
    fillKey: createWhiteboardPaletteKey('bg', 22),
    strokeKey: createWhiteboardPaletteKey('border', 23)
  },
  {
    id: '23',
    fillKey: createWhiteboardPaletteKey('bg', 23),
    strokeKey: createWhiteboardPaletteKey('border', 24)
  },
  {
    id: '25',
    fillKey: createWhiteboardPaletteKey('bg', 25),
    strokeKey: createWhiteboardPaletteKey('border', 26)
  },
  {
    id: '28',
    fillKey: createWhiteboardPaletteKey('bg', 28),
    strokeKey: createWhiteboardPaletteKey('border', 29)
  }
] as const
