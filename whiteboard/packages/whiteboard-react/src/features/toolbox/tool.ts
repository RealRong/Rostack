import type {
  DrawBrushKind,
  DrawKind,
  EdgePresetKey
} from '@whiteboard/editor'

export const DEFAULT_EDGE_PRESET_KEY: EdgePresetKey = 'edge.straight'
export const DEFAULT_DRAW_BRUSH_KIND: DrawBrushKind = 'pen'
export const DEFAULT_DRAW_KIND: DrawKind = DEFAULT_DRAW_BRUSH_KIND

export const isDrawBrushKind = (
  value: string
): value is DrawBrushKind => (
  value === 'pen'
  || value === 'highlighter'
)
