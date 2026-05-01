import type {
  EdgeLabelMaskRect,
  EdgeStaticStyle
} from '@whiteboard/core/edge'
import type { Guide } from '@whiteboard/core/node'
import type {
  Edge,
  EdgeId,
  NodeGeometry,
  NodeId,
  NodeModel,
  Point,
  Rect
} from '@whiteboard/core/types'
import type {
  EditCaret,
  EditField
} from '@whiteboard/editor/protocol'
import type {
  DrawPreview,
  MindmapPreview,
  OwnerRef
} from './editor'

export interface NodeRenderView {
  id: NodeId
  node: NodeModel
  owner?: OwnerRef
  rect: Rect
  bounds: Rect
  rotation: number
  outline: NodeGeometry
  presentation?: {
    position?: Point
  }
  state: {
    hidden: boolean
    selected: boolean
    hovered: boolean
    editing: boolean
    patched: boolean
    resizing: boolean
  }
  edit?: {
    field: EditField
    caret: EditCaret
  }
}

export type EdgeStaticId = string
export type EdgeLabelKey = `${EdgeId}:${string}`

export interface EdgeStaticPath {
  id: EdgeId
  svgPath: string
}

export interface EdgeStaticView {
  id: EdgeStaticId
  styleKey: string
  style: EdgeStaticStyle
  paths: readonly EdgeStaticPath[]
}

export interface EdgeActiveView {
  edgeId: EdgeId
  svgPath: string
  style: EdgeStaticStyle
  box?: {
    rect: Rect
    pad: number
  }
  state: {
    hovered: boolean
    selected: boolean
    editing: boolean
  }
}

export interface EdgeLabelView {
  key: EdgeLabelKey
  edgeId: EdgeId
  labelId: string
  point: Point
  angle: number
  text: string
  displayText: string
  style: NonNullable<Edge['labels']>[number]['style']
  editing: boolean
  selected: boolean
  caret?: EditCaret
}

export interface EdgeMaskView {
  edgeId: EdgeId
  rects: readonly EdgeLabelMaskRect[]
}

export interface EdgeOverlayEndpointHandle {
  edgeId: EdgeId
  end: 'source' | 'target'
  point: Point
}

export type EdgeOverlayRoutePoint = {
  key: string
  kind: 'anchor' | 'insert' | 'control'
  edgeId: EdgeId
  point: Point
  active: boolean
  deletable: boolean
  pick:
    | {
        kind: 'anchor'
        index: number
      }
    | {
        kind: 'segment'
        insertIndex: number
        segmentIndex: number
        axis: 'x' | 'y'
      }
}

export interface EdgeOverlayView {
  previewPath?: {
    svgPath: string
    style: EdgeStaticStyle
  }
  snapPoint?: Point
  endpointHandles: readonly EdgeOverlayEndpointHandle[]
  routePoints: readonly EdgeOverlayRoutePoint[]
}

export interface ChromeRenderView {
  marquee?: {
    worldRect: Rect
    match: 'touch' | 'contain'
  }
  guides: readonly Guide[]
  draw: DrawPreview | null
  mindmap: MindmapPreview | null
  edge: EdgeOverlayView
}
