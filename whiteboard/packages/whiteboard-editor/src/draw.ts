import type { DrawBrushKind } from './types/tool'
export type {
  BrushStyle,
  BrushStylePatch,
  DrawBrush,
  DrawPreferences,
  DrawPreview,
  DrawSlot,
  ResolvedDrawStyle
} from './types/draw'
import type {
  BrushStyle,
  DrawPreferences,
  DrawSlot,
  ResolvedDrawStyle
} from './types/draw'

export const DRAW_SLOTS = ['1', '2', '3'] as const satisfies readonly DrawSlot[]

const DRAW_OPACITY: Readonly<Record<DrawBrushKind, number>> = {
  pen: 1,
  highlighter: 0.35
}

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
