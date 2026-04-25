import type { TextFrameInsets, TextWidthMode } from '@whiteboard/core/node'
import type {
  EdgeId,
  NodeId,
  Rect,
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

export type TextSourceRef =
  | {
      kind: 'node'
      nodeId: NodeId
      field: 'text' | 'title'
    }
  | {
      kind: 'edge-label'
      edgeId: EdgeId
      labelId: string
    }

export type TextMetricsSpec = {
  profile: TextTypographyProfile
  text: string
  placeholder: string
  fontSize: number
  fontWeight?: number | string
  fontStyle?: string
}

export type TextMetrics = Size

export type NodeLayoutGeometry = {
  rect: Rect
  rotation: number
}

export type DraftMeasure =
  | {
      kind: 'size'
      size: Size
    }
  | {
      kind: 'fit'
      fontSize: number
    }
  | undefined

export type TextMetricsResource = {
  measure: (
    spec: TextMetricsSpec
  ) => TextMetrics
  prime: (
    specs: readonly TextMetricsSpec[]
  ) => void
  clear: () => void
}

export type LayoutRequest =
  | {
      kind: 'size'
      nodeId?: NodeId
      source?: TextSourceRef
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
      source?: TextSourceRef
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
