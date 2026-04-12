import {
  readDrawSlot,
  readDrawStyle,
  type DrawPreferences as DrawState,
} from '@whiteboard/editor/draw'
import {
  type DrawKind,
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
  ToolPaletteMemory,
  ToolPaletteView
} from '../../types/toolbox'
import {
  DEFAULT_DRAW_BRUSH_KIND,
  DEFAULT_DRAW_KIND,
  DEFAULT_EDGE_PRESET_KEY,
  isDrawBrushKind
} from './tool'

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

export const DEFAULT_TOOL_PALETTE_MEMORY: ToolPaletteMemory = {
  drawKind: DEFAULT_DRAW_KIND,
  edgePreset: DEFAULT_EDGE_PRESET_KEY,
  stickyPreset: DEFAULT_STICKY_PRESET_KEY,
  shapePreset: DEFAULT_SHAPE_PRESET_KEY,
  mindmapPreset: DEFAULT_MINDMAP_PRESET_KEY
}

export const rememberToolPaletteTool = (
  memory: ToolPaletteMemory,
  tool: Tool
): ToolPaletteMemory => {
  if (tool.type === 'draw') {
    return {
      ...memory,
      drawKind: tool.kind
    }
  }

  if (tool.type === 'edge') {
    return {
      ...memory,
      edgePreset: tool.preset
    }
  }

  if (tool.type !== 'insert') {
    return memory
  }

  const group = readInsertPresetGroup(tool.preset)
  if (group === 'sticky') {
    return {
      ...memory,
      stickyPreset: tool.preset
    }
  }
  if (group === 'shape') {
    return {
      ...memory,
      shapePreset: tool.preset
    }
  }
  if (group === 'mindmap') {
    return {
      ...memory,
      mindmapPreset: tool.preset
    }
  }

  return memory
}

export const readToolPaletteView = ({
  tool,
  drawState,
  memory = DEFAULT_TOOL_PALETTE_MEMORY
}: {
  tool: Tool
  drawState: DrawState
  memory?: ToolPaletteMemory
}): ToolPaletteView => {
  const insertGroup = tool.type === 'insert'
    ? readInsertPresetGroup(tool.preset)
    : undefined
  const stickyPreset = tool.type === 'insert' && insertGroup === 'sticky'
    ? tool.preset
    : memory.stickyPreset
  const shapePreset = tool.type === 'insert' && insertGroup === 'shape'
    ? tool.preset
    : memory.shapePreset
  const mindmapPreset = tool.type === 'insert' && insertGroup === 'mindmap'
    ? tool.preset
    : memory.mindmapPreset
  const edgePreset = tool.type === 'edge'
    ? tool.preset
    : memory.edgePreset
  const drawKind = tool.type === 'draw'
    ? tool.kind
    : memory.drawKind
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
