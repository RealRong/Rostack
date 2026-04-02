import type {
  Node,
  NodeFieldPatch,
  Rect
} from '../types'

export type NodeProjectionPatch = Pick<
  NodeFieldPatch,
  'position' | 'size' | 'rotation'
>

export const applyNodeProjectionRect = (
  rect: Rect,
  patch: NodeProjectionPatch | undefined
): Rect => {
  if (!patch?.position && !patch?.size) {
    return rect
  }

  return {
    x: patch.position?.x ?? rect.x,
    y: patch.position?.y ?? rect.y,
    width: patch.size?.width ?? rect.width,
    height: patch.size?.height ?? rect.height
  }
}

export const applyNodeProjectionPatch = (
  node: Node,
  patch: NodeProjectionPatch | undefined
): Node => {
  if (!patch || node.type === 'group') {
    return node
  }

  const position = patch.position ?? node.position
  const size = patch.size ?? node.size
  const rotation =
    typeof patch.rotation === 'number'
      ? patch.rotation
      : node.rotation

  if (
    position === node.position
    && size === node.size
    && rotation === node.rotation
  ) {
    return node
  }

  return {
    ...node,
    position,
    size,
    rotation
  }
}
