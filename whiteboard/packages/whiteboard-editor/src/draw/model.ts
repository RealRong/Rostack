import type { DrawBrushKind } from '../types/tool'
import type {
  BrushStyle,
  DrawBrush,
  DrawPreferences,
  DrawSlot,
  ResolvedDrawStyle
} from '../types/draw'

export const DRAW_SLOTS = ['1', '2', '3'] as const satisfies readonly DrawSlot[]

const DRAW_OPACITY: Readonly<Record<DrawBrushKind, number>> = {
  pen: 1,
  highlighter: 0.35
}

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

const normalizeBrush = (
  brush: DrawBrush
): DrawBrush => {
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

export const normalizeDrawPreferences = (
  value: DrawPreferences
): DrawPreferences => ({
  pen: normalizeBrush(value.pen),
  highlighter: normalizeBrush(value.highlighter)
})

export const readDrawSlot = (
  state: DrawPreferences,
  kind: DrawBrushKind
): DrawSlot => state[kind].slot

export const readDrawBrushStyle = (
  state: DrawPreferences,
  kind: DrawBrushKind,
  slot: DrawSlot = state[kind].slot
): BrushStyle => state[kind].slots[slot]

export const readDrawStyle = (
  state: DrawPreferences,
  kind: DrawBrushKind
): ResolvedDrawStyle => {
  const style = readDrawBrushStyle(state, kind)

  return {
    kind,
    color: style.color,
    width: style.width,
    opacity: DRAW_OPACITY[kind]
  }
}
