import { resolveNodeBootstrapSize } from '@whiteboard/core/node/bootstrap'
import type {
  Node,
  Rect,
  Size
} from '@whiteboard/core/types'

const EMPTY_SIZE: Size = {
  width: 0,
  height: 0
}

export const resolveProjectedNodeSize = (input: {
  node: Pick<Node, 'type' | 'data' | 'style' | 'size'>
  patch?: Partial<Pick<Node, 'size'>>
  measuredSize?: Size
}): Size => input.patch?.size
  ?? input.measuredSize
  ?? input.node.size
  ?? resolveNodeBootstrapSize(input.node)
  ?? EMPTY_SIZE

export const resolveProjectedNodeRotation = (input: {
  node: Pick<Node, 'rotation'>
  patch?: Partial<Pick<Node, 'rotation'>>
}): number => input.patch?.rotation ?? input.node.rotation ?? 0

export const resolveProjectedNodeRect = (input: {
  node: Pick<Node, 'type' | 'data' | 'style' | 'position' | 'size'>
  patch?: Partial<Pick<Node, 'position' | 'size'>>
  measuredSize?: Size
  rect?: Rect
}): Rect => {
  if (input.rect) {
    return input.rect
  }

  const position = input.patch?.position ?? input.node.position
  const size = resolveProjectedNodeSize(input)

  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height
  }
}
