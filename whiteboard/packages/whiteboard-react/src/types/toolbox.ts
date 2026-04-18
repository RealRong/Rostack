import type { ShapeKind } from '@whiteboard/core/node'
import type {
  DrawBrushState,
  DrawBrush,
  DrawMode,
  DrawSlot,
  DrawStyle
} from '@whiteboard/editor/draw'
import type {
  StickyFormat,
  StickyTone
} from '@whiteboard/react/features/palette'
import type { WhiteboardInsertGroup } from '@whiteboard/product/insert/types'

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
  edgePreset: string
  stickyPreset: string
  shapePreset: string
  mindmapPreset: string
}

export type ToolPaletteView = {
  insertGroup?: WhiteboardInsertGroup
  stickyPreset: string
  stickyTone?: StickyTone
  stickyFormat?: StickyFormat
  shapePreset: string
  shapeKind?: ShapeKind
  mindmapPreset: string
  edgePreset: string
  drawMode: DrawMode
  drawBrush: ToolPaletteBrushState
  drawStyle: DrawStyle
  drawButtonStyle?: DrawStyle
}
