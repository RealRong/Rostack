import type { Point } from '@whiteboard/core/types'
import { WHITEBOARD_DRAW_DEFAULTS } from '@whiteboard/core/node'
import {
  DEFAULT_DRAW_OPACITY,
  DRAW_BRUSHES,
  DRAW_SLOTS,
  type DrawBrush,
  type DrawSlot
} from '@whiteboard/editor/session/draw/model'

export type BrushStyle = Readonly<{
  color: string
  width: number
}>

export type BrushStylePatch = Partial<BrushStyle>

export type DrawBrushState = Readonly<{
  slot: DrawSlot
  slots: Readonly<Record<DrawSlot, BrushStyle>>
}>

export type DrawState = Readonly<Record<DrawBrush, DrawBrushState>>

export type DrawStyle = Readonly<{
  kind: DrawBrush
  color: string
  width: number
  opacity: number
}>

export type DrawPreview = Readonly<{
  kind: DrawBrush
  style: DrawStyle
  points: readonly Point[]
}>

const normalizeStyle = (
  value: BrushStyle
): BrushStyle => ({
  color: typeof value.color === 'string' && value.color.trim()
    ? value.color
    : 'currentColor',
  width: Number.isFinite(value.width)
    ? Math.max(1, value.width)
    : 1
})

const isSameStyle = (
  left: BrushStyle,
  right: BrushStyle
) => (
  left.color === right.color
  && left.width === right.width
)

const normalizeDrawBrushState = (
  brush: DrawBrushState
): DrawBrushState => {
  const slot = DRAW_SLOTS.includes(brush.slot)
    ? brush.slot
    : DRAW_SLOTS[0]

  return {
    slot,
    slots: {
      '1': normalizeStyle(brush.slots['1']),
      '2': normalizeStyle(brush.slots['2']),
      '3': normalizeStyle(brush.slots['3'])
    }
  }
}

const isDrawBrushStateEqual = (
  left: DrawBrushState,
  right: DrawBrushState
) => (
  left === right
  || (
    left.slot === right.slot
    && DRAW_SLOTS.every((slot) => isSameStyle(left.slots[slot], right.slots[slot]))
  )
)

export const DEFAULT_DRAW_STATE: DrawState = WHITEBOARD_DRAW_DEFAULTS

export const normalizeDrawState = (
  value: DrawState
): DrawState => ({
  pen: normalizeDrawBrushState(value.pen),
  highlighter: normalizeDrawBrushState(value.highlighter)
})

export const isDrawStateEqual = (
  left: DrawState,
  right: DrawState
) => DRAW_BRUSHES.every((brush) => (
  isDrawBrushStateEqual(left[brush], right[brush])
))

export const readDrawSlot = (
  state: DrawState,
  brush: DrawBrush
): DrawSlot => state[brush].slot

export const readDrawBrushStyle = (
  state: DrawState,
  brush: DrawBrush,
  slot: DrawSlot = state[brush].slot
): BrushStyle => state[brush].slots[slot]

export const readDrawStyle = (
  state: DrawState,
  brush: DrawBrush
): DrawStyle => {
  const style = readDrawBrushStyle(state, brush)

  return {
    kind: brush,
    color: style.color,
    width: style.width,
    opacity: DEFAULT_DRAW_OPACITY[brush]
  }
}

export const setDrawSlot = (
  state: DrawState,
  brush: DrawBrush,
  slot: DrawSlot
): DrawState => {
  const previous = state[brush]
  if (previous.slot === slot) {
    return state
  }

  const next = {
    ...previous,
    slot
  }

  return isDrawBrushStateEqual(previous, next)
    ? state
    : {
        ...state,
        [brush]: next
      }
}

export const patchDrawStyle = (
  state: DrawState,
  brush: DrawBrush,
  slot: DrawSlot,
  patch: BrushStylePatch
): DrawState => {
  const previous = state[brush]
  const currentStyle = previous.slots[slot]
  const nextStyle = normalizeStyle({
    color: patch.color ?? currentStyle.color,
    width: patch.width ?? currentStyle.width
  })

  if (isSameStyle(currentStyle, nextStyle)) {
    return state
  }

  return {
    ...state,
    [brush]: {
      ...previous,
      slots: {
        ...previous.slots,
        [slot]: nextStyle
      }
      }
  }
}
