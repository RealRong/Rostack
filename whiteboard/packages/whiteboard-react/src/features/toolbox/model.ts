import {
  readDrawSlot,
  readDrawStyle,
  type DrawPreferences as DrawState,
} from '@whiteboard/editor/draw'
import {
  DEFAULT_DRAW_BRUSH_KIND,
  DEFAULT_DRAW_KIND,
  DEFAULT_EDGE_PRESET_KEY,
  isDrawBrushKind,
  type DrawKind,
  type EdgePresetKey,
  type Tool
} from '@whiteboard/editor'
import {
  DEFAULT_MINDMAP_PRESET_KEY,
  DEFAULT_SHAPE_PRESET_KEY,
  DEFAULT_STICKY_PRESET_KEY,
  readInsertPresetGroup,
  readShapePresetKind,
  readStickyInsertTone
} from './presets'
import type {
  ToolPaletteBrushState,
  ToolPaletteView
} from '../../types/toolbox'

const readToolPaletteBrushState = (
  state: DrawState,
  kind: DrawKind
): ToolPaletteBrushState => {
  const brushKind = isDrawBrushKind(kind)
    ? kind
    : DEFAULT_DRAW_BRUSH_KIND
  const brush = state[brushKind]

  return {
    brushKind,
    brush,
    slot: readDrawSlot(state, brushKind)
  }
}

export const readToolPaletteView = ({
  tool,
  drawState,
  lastDrawKind = DEFAULT_DRAW_KIND,
  lastEdgePreset = DEFAULT_EDGE_PRESET_KEY
}: {
  tool: Tool
  drawState: DrawState
  lastDrawKind?: DrawKind
  lastEdgePreset?: EdgePresetKey
}): ToolPaletteView => {
  const insertGroup = tool.type === 'insert'
    ? readInsertPresetGroup(tool.preset)
    : undefined
  const stickyPreset = tool.type === 'insert' && insertGroup === 'sticky'
    ? tool.preset
    : DEFAULT_STICKY_PRESET_KEY
  const shapePreset = tool.type === 'insert' && insertGroup === 'shape'
    ? tool.preset
    : DEFAULT_SHAPE_PRESET_KEY
  const mindmapPreset = tool.type === 'insert' && insertGroup === 'mindmap'
    ? tool.preset
    : DEFAULT_MINDMAP_PRESET_KEY
  const edgePreset = tool.type === 'edge'
    ? tool.preset
    : lastEdgePreset
  const drawKind = tool.type === 'draw'
    ? tool.kind
    : lastDrawKind
  const drawBrush = readToolPaletteBrushState(drawState, drawKind)
  const drawStyle = readDrawStyle(drawState, drawBrush.brushKind)

  return {
    insertGroup,
    stickyPreset,
    stickyTone: readStickyInsertTone(stickyPreset),
    shapePreset,
    shapeKind: readShapePresetKind(shapePreset),
    mindmapPreset,
    edgePreset,
    drawKind,
    drawBrush,
    drawStyle,
    drawButtonStyle: isDrawBrushKind(drawKind)
      ? drawStyle
      : undefined
  }
}
