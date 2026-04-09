import type {
  EdgeDash,
  EdgeId,
  EdgeMarker,
  EdgeTextMode,
  EdgeType,
  Rect
} from '@whiteboard/core/types'

export type EdgeToolbarContext = {
  box: Rect
  selectionKey: string
  edgeIds: readonly EdgeId[]
  primaryEdgeId?: EdgeId
  type?: EdgeType
  color?: string
  width?: number
  dash?: EdgeDash
  start?: EdgeMarker
  end?: EdgeMarker
  textMode?: EdgeTextMode
  labelCount: number
}
