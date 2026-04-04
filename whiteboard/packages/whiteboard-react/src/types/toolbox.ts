import type { ShapeKind } from '@whiteboard/core/node'
import type {
  DrawBrush,
  DrawSlot,
  ResolvedDrawStyle
} from '@whiteboard/editor/draw'
import type {
  DrawBrushKind,
  DrawKind,
  EdgePresetKey
} from '@whiteboard/editor'
import type { InsertPresetGroup, StickyTone } from '../features/toolbox/presets'

export type ToolPaletteMenuKey =
  | 'draw'
  | 'edge'
  | 'sticky'
  | 'shape'
  | 'mindmap'

export type ToolPaletteBrushState = {
  brushKind: DrawBrushKind
  brush: DrawBrush
  slot: DrawSlot
}

export type ToolPaletteMemory = {
  drawKind: DrawKind
  edgePreset: EdgePresetKey
  stickyPreset: string
  shapePreset: string
  mindmapPreset: string
}

export type ToolPaletteView = {
  insertGroup?: InsertPresetGroup
  stickyPreset: string
  stickyTone?: StickyTone
  shapePreset: string
  shapeKind?: ShapeKind
  mindmapPreset: string
  edgePreset: EdgePresetKey
  drawKind: DrawKind
  drawBrush: ToolPaletteBrushState
  drawStyle: ResolvedDrawStyle
  drawButtonStyle?: ResolvedDrawStyle
}
