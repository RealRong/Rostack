import type { MindmapNodeFrameKind } from '@whiteboard/core/types'
import type {
  MindmapBranchLineKind,
  MindmapStrokeStyle
} from '@whiteboard/core/mindmap'
import { WHITEBOARD_STROKE_STYLE_OPTIONS } from '@whiteboard/product/stroke/options'

export type WhiteboardMindmapBranchLineOption = {
  value: MindmapBranchLineKind
  label: string
}

export type WhiteboardMindmapBranchStrokeOption = {
  value: MindmapStrokeStyle
  label: string
}

export type WhiteboardMindmapBorderKindOption = {
  value: MindmapNodeFrameKind
  label: string
}

export const WHITEBOARD_MINDMAP_UI = {
  branchLines: [
    { value: 'curve', label: 'Curve' },
    { value: 'elbow', label: 'Elbow' },
    { value: 'rail', label: 'Rail' }
  ] as const satisfies readonly WhiteboardMindmapBranchLineOption[],
  branchStrokes: WHITEBOARD_STROKE_STYLE_OPTIONS.map((option) => ({
    value: option.key,
    label: option.label
  })) as readonly WhiteboardMindmapBranchStrokeOption[],
  borderKinds: [
    { value: 'ellipse', label: 'Ellipse' },
    { value: 'rect', label: 'Rectangle' },
    { value: 'underline', label: 'Underline' }
  ] as const satisfies readonly WhiteboardMindmapBorderKindOption[]
} as const
