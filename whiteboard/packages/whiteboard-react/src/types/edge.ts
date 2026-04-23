import type { EdgeLabelMaskRect } from '@whiteboard/core/edge'
import type {
  Edge,
  EdgeId,
  Point,
  Size
} from '@whiteboard/core/types'
import type { EditCaret } from '@whiteboard/editor'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

export type EdgeLabelView = {
  id: string
  text: string
  displayText: string
  style: NonNullable<Edge['labels']>[number]['style']
  editing: boolean
  caret?: EditCaret
  point: Point
  angle: number
  size: Size
  maskRect: EdgeLabelMaskRect
}

export type EdgeView = {
  edgeId: EdgeId
  edge: Edge
  selected: boolean
  box?: {
    rect: {
      x: number
      y: number
      width: number
      height: number
    }
    pad: number
  }
  path: {
    svgPath?: string
    points: readonly Point[]
  }
  labels: readonly EdgeLabelView[]
}

export type SelectedEdgeChrome = NonNullable<
  ReturnType<WhiteboardRuntime['read']['edge']['selectedChrome']['get']>
>

export type SelectedEdgeRoutePoint = SelectedEdgeChrome['routePoints'][number]
