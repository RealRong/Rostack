import type { TextWidthMode } from '@whiteboard/core/node'
import type {
  EdgeId,
  NodeId,
  Size
} from '@whiteboard/core/types'

export type LayoutKind = 'none' | 'size' | 'fit'

export type NodeLayoutSpec = {
  kind: LayoutKind
}

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
      nodeId: NodeId
      sourceId: TextSourceId
      text: string
      placeholder: string
      widthMode: TextWidthMode
      wrapWidth?: number
      fontSize: number
      fontWeight?: number | string
      fontStyle?: string
    }
  | {
      kind: 'fit'
      nodeId: NodeId
      sourceId: TextSourceId
      text: string
      box: Size
      minFontSize?: number
      maxFontSize?: number
      fontWeight?: number | string
      fontStyle?: string
      textAlign?: 'left' | 'center' | 'right'
    }
  | {
      kind: 'text-size'
      sourceId: TextSourceId
      text: string
      placeholder: string
      widthMode: TextWidthMode
      wrapWidth?: number
      fontSize: number
      fontWeight?: number | string
      fontStyle?: string
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
