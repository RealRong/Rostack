import type {
  Guide,
  ResizeGestureSnapshot,
  ResizeDirection,
  RotateGestureSnapshot,
  TransformHandle,
  TransformPreviewPatch
} from '@whiteboard/core/node'
import type { Node, NodeId, Point, Rect } from '@whiteboard/core/types'
import type { ModifierKeys } from '../../types/input'
import type { InteractionCtx } from '../../runtime/interaction'

export type TransformInteractionCtx = Pick<
  InteractionCtx,
  'read' | 'write' | 'config' | 'snap'
>

export type TransformPointerInput = {
  screen: Point
  world: Point
  modifiers: ModifierKeys
}

export type ResizeDragState = ResizeGestureSnapshot & {
  mode: 'resize'
  pointerId: number
}

export type RotateDragState = RotateGestureSnapshot & {
  mode: 'rotate'
  pointerId: number
}

export type TransformDragState = ResizeDragState | RotateDragState

export type TransformTarget = {
  id: NodeId
  node: Node
  rect: Rect
}

export type TransformSession = {
  targets: readonly TransformTarget[]
  commitTargetIds?: ReadonlySet<NodeId>
  drag: TransformDragState
}

export type TransformProjection = {
  patches: readonly TransformPreviewPatch[]
  guides: readonly Guide[]
}

export type TransformPickHandle = Pick<TransformHandle, 'kind' | 'direction'>
