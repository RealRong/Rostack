import type { ShapeKind } from '@whiteboard/core/node'
import type {
  DrawMode,
  Editor
} from '@whiteboard/editor'
import type {
  WhiteboardDrawView
} from '@whiteboard/product'
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

export type ToolPaletteDrawBrush = WhiteboardDrawView['brush']
export type ToolPaletteDrawSlot = WhiteboardDrawView['slot']
export type ToolPaletteBrushStyle = WhiteboardDrawView['state']['slots'][ToolPaletteDrawSlot]
export type ToolPaletteBrushStylePatch = Parameters<Editor['actions']['draw']['patch']>[0]

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
  draw: WhiteboardDrawView
}
