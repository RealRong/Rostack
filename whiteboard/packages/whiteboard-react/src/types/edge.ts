import type { EdgeHandle } from '@whiteboard/core/edge'
import type { EdgeId } from '@whiteboard/core/types'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

export type EdgeResolved = NonNullable<
  ReturnType<WhiteboardRuntime['read']['edge']['resolved']['get']>
>

export type EdgeState = EdgeResolved

export type EdgeView = NonNullable<
  ReturnType<WhiteboardRuntime['read']['edge']['view']['get']>
>

export type SelectedEdgeRoutePointView = {
  key: string
  kind: 'anchor' | 'insert' | 'control'
  edgeId: EdgeId
  point: EdgeHandle['point']
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

export type SelectedEdgeView = {
  edgeId: EdgeId
  ends: EdgeView['ends']
  canReconnectSource: boolean
  canReconnectTarget: boolean
  canEditRoute: boolean
  routePoints: readonly SelectedEdgeRoutePointView[]
}
