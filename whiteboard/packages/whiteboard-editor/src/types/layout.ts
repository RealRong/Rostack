import type { TextWidthMode } from '@whiteboard/core/node'
import type {
  NodeId,
  Size
} from '@whiteboard/core/types'

export type LayoutKind = 'none' | 'size' | 'fit'

export type NodeLayoutSpec = {
  kind: LayoutKind
}

export type LayoutRequest =
  | {
      kind: 'size'
      nodeId: NodeId
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
