import type { TextFrameInsets, TextWidthMode } from '@whiteboard/core/node'
import type {
  EdgeId,
  NodeId,
  Size
} from '@whiteboard/core/types'

export type LayoutKind = 'none' | 'size' | 'fit'

export type NodeLayoutSpec = {
  kind: LayoutKind
}

export type TextTypographyProfile =
  | 'default-text'
  | 'sticky-text'
  | 'edge-label'
  | 'frame-title'
  | 'shape-label'

export type TextSourceField = 'text' | 'title'
export type TextSourceId = string

export const readNodeTextSourceId = (
  nodeId: NodeId,
  field: TextSourceField
): TextSourceId => `node:${nodeId}:${field}`

export const readEdgeLabelTextSourceId = (
  edgeId: EdgeId,
  labelId: string
): TextSourceId => `edge:${edgeId}:label:${labelId}`

export type LayoutRequest =
  | {
      kind: 'size'
      nodeId?: NodeId
      sourceId?: TextSourceId
      typography: TextTypographyProfile
      text: string
      placeholder: string
      widthMode: TextWidthMode
      wrapWidth?: number
      frame: TextFrameInsets
      minWidth?: number
      maxWidth?: number
      fontSize: number
      fontWeight?: number | string
      fontStyle?: string
    }
  | {
      kind: 'fit'
      nodeId: NodeId
      sourceId?: TextSourceId
      typography: TextTypographyProfile
      text: string
      box: Size
      minFontSize?: number
      maxFontSize?: number
      fontWeight?: number | string
      fontStyle?: string
      textAlign?: 'left' | 'center' | 'right'
    }

export type LayoutResult =
  | {
      kind: 'size'
      size: Size
    }
  | {
      kind: 'fit'
      fontSize: number
    }

export type LayoutBackend = {
  measure: (request: LayoutRequest) => LayoutResult | undefined
}
