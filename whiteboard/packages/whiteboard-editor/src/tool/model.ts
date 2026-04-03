import type { EdgeType } from '@whiteboard/core/types'
import type {
  DrawBrushKind,
  DrawKind,
  DrawTool,
  EdgeTool,
  InsertPresetKey,
  InsertTool,
  EdgePresetKey,
  HandTool,
  SelectTool,
  Tool
} from '../types/tool'

export const DEFAULT_EDGE_PRESET_KEY: EdgePresetKey = 'edge.straight'
export const DEFAULT_DRAW_BRUSH_KIND: DrawBrushKind = 'pen'
export const DEFAULT_DRAW_KIND: DrawKind = DEFAULT_DRAW_BRUSH_KIND

export const selectTool = (): SelectTool => ({ type: 'select' })

export const handTool = (): HandTool => ({ type: 'hand' })

export const edgeTool = (
  preset: EdgePresetKey = DEFAULT_EDGE_PRESET_KEY
): EdgeTool => ({
  type: 'edge',
  preset
})

const EDGE_PRESET_TO_TYPE = {
  'edge.straight': 'linear',
  'edge.elbow': 'step',
  'edge.curve': 'curve'
} as const satisfies Record<EdgePresetKey, EdgeType>

export const readEdgeType = (
  preset: EdgePresetKey
): EdgeType => EDGE_PRESET_TO_TYPE[preset]

export const drawTool = (
  kind: DrawKind = DEFAULT_DRAW_KIND
): DrawTool => ({
  type: 'draw',
  kind
})

export const insertTool = (
  preset: InsertPresetKey
): InsertTool => ({
  type: 'insert',
  preset
})

const isDrawBrushKindValue = (
  value: string
): value is DrawBrushKind => (
  value === 'pen'
  || value === 'highlighter'
)

export const isDrawBrushKind = (
  value: string
): value is DrawBrushKind => isDrawBrushKindValue(value)

export const isDrawKind = (
  value: string
): value is DrawKind => (
  value === 'eraser'
  || isDrawBrushKindValue(value)
)

export const isSameTool = (
  left: Tool,
  right: Tool
) => {
  if (left.type !== right.type) {
    return false
  }

  switch (left.type) {
    case 'edge':
      return right.type === 'edge' && left.preset === right.preset
    case 'insert':
      return right.type === 'insert' && left.preset === right.preset
    case 'draw':
      return right.type === 'draw' && left.kind === right.kind
    default:
      return true
  }
}
