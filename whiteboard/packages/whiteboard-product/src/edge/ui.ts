import type {
  EdgeDash,
  EdgeTextMode,
  EdgeType
} from '@whiteboard/core/types'
import {
  WHITEBOARD_EDGE_PRESETS
} from '@whiteboard/product/edge/presets'
import {
  WHITEBOARD_STROKE_STYLE_OPTIONS
} from '@whiteboard/product/stroke/options'

export type WhiteboardEdgeTypeOption = {
  value: EdgeType
  label: string
}

export type WhiteboardEdgeDashOption = {
  value: EdgeDash
  label: string
}

export type WhiteboardEdgeTextModeOption = {
  value: EdgeTextMode
  label: string
}

export type WhiteboardEdgePresetOption = {
  key: string
  label: string
}

export const WHITEBOARD_EDGE_UI = {
  palette: {
    group: 'line',
    columns: 10
  },
  types: [
    { value: 'straight', label: 'Straight' },
    { value: 'elbow', label: 'Elbow' },
    { value: 'fillet', label: 'Fillet' },
    { value: 'curve', label: 'Curve' }
  ] as const satisfies readonly WhiteboardEdgeTypeOption[],
  dashes: WHITEBOARD_STROKE_STYLE_OPTIONS.map((option) => ({
    value: option.key,
    label: option.label
  })) as readonly WhiteboardEdgeDashOption[],
  widths: [1, 2, 3, 4, 6, 8, 12, 16] as const,
  textModes: [
    { value: 'horizontal', label: 'Horizontal' },
    { value: 'tangent', label: 'Tangent' }
  ] as const satisfies readonly WhiteboardEdgeTextModeOption[],
  presets: WHITEBOARD_EDGE_PRESETS.map((preset) => ({
    key: preset.key,
    label: preset.label
  })) as readonly WhiteboardEdgePresetOption[]
} as const
