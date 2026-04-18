import {
  createWhiteboardPaletteKey
} from '@whiteboard/product/palette/key'

export type WhiteboardDrawMode =
  | 'pen'
  | 'highlighter'
  | 'eraser'

export type WhiteboardDrawBrush = Exclude<WhiteboardDrawMode, 'eraser'>

export type WhiteboardDrawSlot =
  | '1'
  | '2'
  | '3'

export type WhiteboardDrawBrushStyle = Readonly<{
  color: string
  width: number
}>

export type WhiteboardDrawBrushState = Readonly<{
  slot: WhiteboardDrawSlot
  slots: Readonly<Record<WhiteboardDrawSlot, WhiteboardDrawBrushStyle>>
}>

export type WhiteboardDrawState = Readonly<Record<WhiteboardDrawBrush, WhiteboardDrawBrushState>>

export type WhiteboardDrawStyle = Readonly<{
  kind: WhiteboardDrawBrush
  color: string
  width: number
  opacity: number
}>

export type WhiteboardDrawView = Readonly<{
  brush: WhiteboardDrawBrush
  state: WhiteboardDrawBrushState
  slot: WhiteboardDrawSlot
  style: WhiteboardDrawStyle
  buttonStyle?: WhiteboardDrawStyle
}>

export const WHITEBOARD_DRAW_MODES = [
  'pen',
  'highlighter',
  'eraser'
] as const satisfies readonly WhiteboardDrawMode[]

export const WHITEBOARD_DRAW_SLOTS = [
  '1',
  '2',
  '3'
] as const satisfies readonly WhiteboardDrawSlot[]

export const WHITEBOARD_DRAW_DEFAULT_MODE: WhiteboardDrawMode = 'pen'
const WHITEBOARD_DRAW_DEFAULT_BRUSH: WhiteboardDrawBrush = 'pen'

const WHITEBOARD_DRAW_OPACITY: Readonly<Record<WhiteboardDrawBrush, number>> = {
  pen: 1,
  highlighter: 0.35
}

export const WHITEBOARD_DRAW_WIDTH_RANGE = {
  pen: {
    min: 1,
    max: 16
  },
  highlighter: {
    min: 6,
    max: 24
  }
} as const satisfies Readonly<Record<WhiteboardDrawBrush, {
  min: number
  max: number
}>>

export const WHITEBOARD_DRAW_DEFAULTS: WhiteboardDrawState = {
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

const readVisibleBrush = (
  mode: WhiteboardDrawMode
): WhiteboardDrawBrush | undefined => mode === 'eraser'
  ? undefined
  : mode

const readWhiteboardDrawStyle = (
  state: WhiteboardDrawState,
  brush: WhiteboardDrawBrush
): WhiteboardDrawStyle => {
  const slot = state[brush].slot
  const style = state[brush].slots[slot]

  return {
    kind: brush,
    color: style.color,
    width: style.width,
    opacity: WHITEBOARD_DRAW_OPACITY[brush]
  }
}

export const readWhiteboardDrawView = ({
  state,
  mode
}: {
  state: WhiteboardDrawState
  mode: WhiteboardDrawMode
}): WhiteboardDrawView => {
  const visibleBrush = readVisibleBrush(mode)
  const brush = visibleBrush ?? WHITEBOARD_DRAW_DEFAULT_BRUSH
  const brushState = state[brush]
  const style = readWhiteboardDrawStyle(state, brush)

  return {
    brush,
    state: brushState,
    slot: brushState.slot,
    style,
    buttonStyle: visibleBrush
      ? style
      : undefined
  }
}
