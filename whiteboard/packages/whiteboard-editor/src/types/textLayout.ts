import type {
  Node,
  NodeId,
  Rect,
  Size
} from '@whiteboard/core/types'

export type TextLayoutMeasureInput = {
  nodeId: NodeId
  node: Node
  rect: Rect
}

export type TextLayoutMeasurer = (
  input: TextLayoutMeasureInput
) => Size | undefined
