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

export type TransformTarget = {
  id: NodeId
  node: Node
  rect: Rect
}

export type SingleResizePlan = {
  kind: 'single-resize'
  target: TransformTarget
  drag: ResizeDragState
}

export type SingleRotatePlan = {
  kind: 'single-rotate'
  target: TransformTarget
  drag: RotateDragState
}

export type MultiScalePlan = {
  kind: 'multi-scale'
  box: Rect
  targets: readonly TransformTarget[]
  commitIds: ReadonlySet<NodeId>
  drag: ResizeDragState
}

export type TransformPlan =
  | SingleResizePlan
  | SingleRotatePlan
  | MultiScalePlan

export type TransformPreview = {
  nodePatches: readonly TransformPreviewPatch[]
  guides: readonly Guide[]
}

export type TransformPickHandle = Pick<TransformHandle, 'kind' | 'direction'>
