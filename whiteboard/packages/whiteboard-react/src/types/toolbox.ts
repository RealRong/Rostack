import type { ShapeKind } from '@whiteboard/core/node'
import type {
  DrawBrushState,
  DrawBrush,
  DrawMode,
  DrawSlot,
  DrawStyle
} from '@whiteboard/editor/draw'
import type {
  EdgePresetKey
} from '@whiteboard/editor'
import type {
  InsertPresetGroup,
  StickyFormat,
  StickyTone
} from '@whiteboard/react/features/toolbox/presets'

export type ToolPaletteMenuKey =
  | 'draw'
  | 'edge'
  | 'sticky'
  | 'shape'
  | 'mindmap'

export type ToolPaletteBrushState = {
  brush: DrawBrush
  state: DrawBrushState
  slot: DrawSlot
}

export type ToolPaletteMemory = {
  drawMode: DrawMode
  edgePreset: EdgePresetKey
  stickyPreset: string
  shapePreset: string
  mindmapPreset: string
}

export type ToolPaletteView = {
  insertGroup?: InsertPresetGroup
  stickyPreset: string
  stickyTone?: StickyTone
  stickyFormat?: StickyFormat
  shapePreset: string
  shapeKind?: ShapeKind
  mindmapPreset: string
  edgePreset: EdgePresetKey
  drawMode: DrawMode
  drawBrush: ToolPaletteBrushState
  drawStyle: DrawStyle
  drawButtonStyle?: DrawStyle
}
