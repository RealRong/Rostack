import type {
  EdgeLabelMaskRect,
  EdgeStaticStyle
} from '@whiteboard/core/edge'
import type {
  Edge,
  EdgeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type {
  Family,
  Flags
} from '@shared/projector/publish'
import type { IdDelta } from './delta'
import type { EditCaret } from './editor'

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

export interface RenderSnapshot {
  edge: {
    statics: Family<EdgeStaticId, EdgeStaticView>
    active: Family<EdgeId, EdgeActiveView>
    labels: Family<EdgeLabelKey, EdgeLabelView>
    masks: Family<EdgeId, EdgeMaskView>
    overlay: EdgeOverlayView
  }
}

export interface RenderChange {
  edge: {
    statics: IdDelta<EdgeStaticId>
    active: IdDelta<EdgeId>
    labels: IdDelta<EdgeLabelKey>
    masks: IdDelta<EdgeId>
    overlay: Flags
  }
}
