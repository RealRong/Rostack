import { isPointEqual } from '../geometry'
import type {
  Edge,
  EdgeEnd,
  EdgePatch
} from '../types'

const isEdgeEndEqual = (
  left: EdgeEnd | undefined,
  right: EdgeEnd | undefined
) => {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return left === right
  }

  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'point' && right.kind === 'point') {
    return isPointEqual(left.point, right.point)
  }

  if (left.kind === 'node' && right.kind === 'node') {
    return left.nodeId === right.nodeId
      && left.anchor?.side === right.anchor?.side
      && left.anchor?.offset === right.anchor?.offset
  }

  return false
}

export const isEdgePatchEqual = (
  left?: EdgePatch,
  right?: EdgePatch
) => (
  left?.type === right?.type
  && isEdgeEndEqual(left?.source, right?.source)
  && isEdgeEndEqual(left?.target, right?.target)
  && left?.route === right?.route
)

export const applyEdgePatch = (
  edge: Edge,
  patch?: EdgePatch
): Edge => {
  if (!patch) {
    return edge
  }

  let next = edge

  if (patch.type && patch.type !== next.type) {
    next = {
      ...next,
      type: patch.type
    }
  }

  if (patch.source && patch.source !== next.source) {
    next = {
      ...next,
      source: patch.source
    }
  }

  if (patch.target && patch.target !== next.target) {
    next = {
      ...next,
      target: patch.target
    }
  }

  if (patch.route && patch.route !== next.route) {
    next = {
      ...next,
      route:
        patch.route.kind === 'manual'
          ? {
              kind: 'manual',
              points: [...patch.route.points]
            }
          : {
              kind: 'auto'
            }
    }
  }

  return next
}
