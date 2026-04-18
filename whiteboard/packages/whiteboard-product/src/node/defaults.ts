import type { Node } from '@whiteboard/core/types'
import { readShapeKind } from '@whiteboard/core/node'
import {
  WHITEBOARD_FRAME_DEFAULTS,
  WHITEBOARD_TEXT_DEFAULT_COLOR
} from '@whiteboard/product/palette/defaults'
import {
  WHITEBOARD_STICKY_DEFAULTS
} from '@whiteboard/product/palette/defaults'
import {
  getWhiteboardShapeSpec
} from '@whiteboard/product/node/shapes'

export const WHITEBOARD_DRAW_NODE_DEFAULTS = {
  stroke: WHITEBOARD_TEXT_DEFAULT_COLOR,
  strokeWidth: 2
} as const

export const WHITEBOARD_TEXT_NODE_DEFAULTS = {
  color: WHITEBOARD_TEXT_DEFAULT_COLOR
} as const

export const readWhiteboardNodePaintDefaults = (
  node: Pick<Node, 'type' | 'data'>
) => {
  if (node.type === 'shape') {
    return getWhiteboardShapeSpec(readShapeKind(node)).defaults
  }

  if (node.type === 'sticky') {
    return WHITEBOARD_STICKY_DEFAULTS
  }

  if (node.type === 'frame') {
    return WHITEBOARD_FRAME_DEFAULTS
  }

  if (node.type === 'draw') {
    return WHITEBOARD_DRAW_NODE_DEFAULTS
  }

  if (node.type === 'text') {
    return WHITEBOARD_TEXT_NODE_DEFAULTS
  }

  return undefined
}
