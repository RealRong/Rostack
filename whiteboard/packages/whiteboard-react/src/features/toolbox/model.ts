import { json } from '@shared/core'
import {
  type DrawMode,
  type DrawState,
} from '@whiteboard/editor'
import { type Tool } from '@whiteboard/editor'
import {
  readStickyInsertFormat,
  readStickyInsertTone
} from '@whiteboard/react/features/palette'
import { product } from '@whiteboard/product'
import type {
  ToolPaletteMemory,
  ToolPaletteView
} from '@whiteboard/react/types/toolbox'

const isSameTemplate = (
  left: unknown,
  right: unknown
) => json.equal(left, right)

const readInsertPresetKey = (
  tool: Extract<Tool, { type: 'insert' }>
) => product.insert.catalog.WHITEBOARD_INSERT_PRESETS.find((preset) => (
  isSameTemplate(preset.template, tool.template)
))?.key

const readEdgePresetKey = (
  tool: Extract<Tool, { type: 'edge' }>
) => product.edge.presets.WHITEBOARD_EDGE_PRESETS.find((preset) => (
  isSameTemplate(preset.template, tool.template)
))?.key

export const DEFAULT_TOOL_PALETTE_MEMORY: ToolPaletteMemory = {
  drawMode: product.draw.defaultMode,
  edgePreset: product.edge.presets.DEFAULT_WHITEBOARD_EDGE_PRESET_KEY,
  stickyPreset: product.insert.catalog.DEFAULT_WHITEBOARD_STICKY_PRESET,
  shapePreset: product.insert.catalog.DEFAULT_WHITEBOARD_SHAPE_PRESET,
  mindmapPreset: product.insert.catalog.DEFAULT_WHITEBOARD_MINDMAP_PRESET
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
    ? product.insert.catalog.getWhiteboardInsertPreset(insertPreset)?.group
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
    ? product.insert.catalog.getWhiteboardInsertPreset(activeInsertPreset)?.group
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
  const draw = product.draw.view({
    state: drawState,
    mode: drawMode
  })

  return {
    insertGroup,
    stickyPreset,
    stickyTone: readStickyInsertTone(stickyPreset),
    stickyFormat: readStickyInsertFormat(stickyPreset),
    shapePreset,
    shapeKind: product.insert.catalog.readWhiteboardShapePresetKind(shapePreset),
    mindmapPreset,
    edgePreset,
    drawMode,
    draw
  }
}
