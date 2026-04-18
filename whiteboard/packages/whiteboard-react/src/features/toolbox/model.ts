import {
  readDrawSlot,
  readDrawStyle,
  DEFAULT_DRAW_BRUSH,
  DEFAULT_DRAW_MODE,
  hasDrawBrush,
  type DrawMode,
  type DrawState,
} from '@whiteboard/editor/draw'
import { type Tool } from '@whiteboard/editor'
import {
  readStickyInsertFormat,
  readStickyInsertTone
} from '@whiteboard/react/features/palette'
import {
  DEFAULT_WHITEBOARD_EDGE_PRESET_KEY,
  DEFAULT_WHITEBOARD_MINDMAP_PRESET,
  DEFAULT_WHITEBOARD_SHAPE_PRESET,
  DEFAULT_WHITEBOARD_STICKY_PRESET,
  WHITEBOARD_EDGE_PRESETS,
  WHITEBOARD_INSERT_PRESETS,
  getWhiteboardInsertPreset,
  readWhiteboardShapePresetKind
} from '@whiteboard/product'
import type {
  ToolPaletteBrushState,
  ToolPaletteMemory,
  ToolPaletteView
} from '@whiteboard/react/types/toolbox'

const isSameTemplate = (
  left: unknown,
  right: unknown
) => JSON.stringify(left) === JSON.stringify(right)

const readInsertPresetKey = (
  tool: Extract<Tool, { type: 'insert' }>
) => WHITEBOARD_INSERT_PRESETS.find((preset) => (
  isSameTemplate(preset.template, tool.template)
))?.key

const readEdgePresetKey = (
  tool: Extract<Tool, { type: 'edge' }>
) => WHITEBOARD_EDGE_PRESETS.find((preset) => (
  isSameTemplate(preset.template, tool.template)
))?.key

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
  edgePreset: DEFAULT_WHITEBOARD_EDGE_PRESET_KEY,
  stickyPreset: DEFAULT_WHITEBOARD_STICKY_PRESET,
  shapePreset: DEFAULT_WHITEBOARD_SHAPE_PRESET,
  mindmapPreset: DEFAULT_WHITEBOARD_MINDMAP_PRESET
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
    const edgePreset = readEdgePresetKey(tool)
    if (!edgePreset) {
      return memory
    }

    return {
      ...memory,
      edgePreset
    }
  }

  if (tool.type !== 'insert') {
    return memory
  }

  const insertPreset = readInsertPresetKey(tool)
  const group = insertPreset
    ? getWhiteboardInsertPreset(insertPreset)?.group
    : undefined
  if (group === 'sticky') {
    return {
      ...memory,
      stickyPreset: insertPreset ?? memory.stickyPreset
    }
  }
  if (group === 'shape') {
    return {
      ...memory,
      shapePreset: insertPreset ?? memory.shapePreset
    }
  }
  if (group === 'mindmap') {
    return {
      ...memory,
      mindmapPreset: insertPreset ?? memory.mindmapPreset
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
  const activeInsertPreset = tool.type === 'insert'
    ? readInsertPresetKey(tool)
    : undefined
  const insertGroup = activeInsertPreset
    ? getWhiteboardInsertPreset(activeInsertPreset)?.group
    : undefined
  const stickyPreset = tool.type === 'insert' && insertGroup === 'sticky'
    ? (activeInsertPreset ?? memory.stickyPreset)
    : memory.stickyPreset
  const shapePreset = tool.type === 'insert' && insertGroup === 'shape'
    ? (activeInsertPreset ?? memory.shapePreset)
    : memory.shapePreset
  const mindmapPreset = tool.type === 'insert' && insertGroup === 'mindmap'
    ? (activeInsertPreset ?? memory.mindmapPreset)
    : memory.mindmapPreset
  const edgePreset = tool.type === 'edge'
    ? (readEdgePresetKey(tool) ?? memory.edgePreset)
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
    shapeKind: readWhiteboardShapePresetKind(shapePreset),
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
