import {
  readDrawSlot,
  readDrawStyle,
  DEFAULT_DRAW_BRUSH,
  DEFAULT_DRAW_MODE,
  hasDrawBrush,
  type DrawMode,
  type DrawState,
} from '@whiteboard/editor/draw'
import {
  DEFAULT_EDGE_PRESET_KEY,
  type Tool
} from '@whiteboard/editor'
import {
  readStickyInsertFormat,
  readStickyInsertTone
} from '@whiteboard/react/features/palette'
import {
  DEFAULT_MINDMAP_PRESET_KEY,
  DEFAULT_SHAPE_PRESET_KEY,
  DEFAULT_STICKY_PRESET_KEY,
  readInsertPresetGroup,
  readShapePresetKind
} from '@whiteboard/react/features/toolbox/presets'
import type {
  ToolPaletteBrushState,
  ToolPaletteMemory,
  ToolPaletteView
} from '@whiteboard/react/types/toolbox'

const readToolPaletteBrushState = (
  state: DrawState,
  mode: DrawMode
): ToolPaletteBrushState => {
  const brush = hasDrawBrush(mode)
    ? mode
    : DEFAULT_DRAW_BRUSH
  const nextState = state[brush]

  return {
    brush,
    state: nextState,
    slot: readDrawSlot(state, brush)
  }
}

export const DEFAULT_TOOL_PALETTE_MEMORY: ToolPaletteMemory = {
  drawMode: DEFAULT_DRAW_MODE,
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
      drawMode: tool.mode
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
  const drawMode = tool.type === 'draw'
    ? tool.mode
    : memory.drawMode
  const drawBrush = readToolPaletteBrushState(drawState, drawMode)
  const drawStyle = readDrawStyle(drawState, drawBrush.brush)

  return {
    insertGroup,
    stickyPreset,
    stickyTone: readStickyInsertTone(stickyPreset),
    stickyFormat: readStickyInsertFormat(stickyPreset),
    shapePreset,
    shapeKind: readShapePresetKind(shapePreset),
    mindmapPreset,
    edgePreset,
    drawMode,
    drawBrush,
    drawStyle,
    drawButtonStyle: hasDrawBrush(drawMode)
      ? drawStyle
      : undefined
  }
}
