import type { EdgeConnectState } from '@whiteboard/core/edge'
import type {
  EdgeId,
  NodeId,
  Point
} from '@whiteboard/core/types'
import type { InteractionCtx } from '../../runtime/interaction/ctx'
import type { PointerDownInput } from '../../types/input'

export type EdgeInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write' | 'config' | 'snap'
>

export type BodyMoveSession = {
  edgeId: EdgeId
  pointerId: number
  start: Point
  delta: Point
}

export type RouteDragSession = {
  kind: 'drag'
  edgeId: EdgeId
  index: number
  pointerId: number
  start: Point
  origin: Point
  point: Point
}

export type RouteState =
  | RouteDragSession
  | {
      kind: 'insert'
      edgeId: EdgeId
      worldPoint: Point
    }
  | {
      kind: 'remove'
      edgeId: EdgeId
      index: number
    }

export type EdgeRoutePick = Extract<PointerDownInput['pick'], {
  kind: 'edge'
}> & {
  part: 'path'
}

export type RoutePoint =
  | {
      kind: 'anchor'
      edgeId: EdgeId
      index: number
      point: Point
    }
  | {
      kind: 'insert'
      edgeId: EdgeId
      insertIndex: number
      point: Point
    }

export type ConnectNodeEntry = NonNullable<
  ReturnType<EdgeInteractionCtx['read']['index']['node']['get']>
>
