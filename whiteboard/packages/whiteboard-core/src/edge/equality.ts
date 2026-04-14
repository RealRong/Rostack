import { isPointEqual } from '@whiteboard/core/geometry'
import type {
  Edge,
  EdgeAnchor,
  EdgeEnd,
  EdgeLabel
} from '@whiteboard/core/types'
import type { ResolvedEdgeEnd } from '@whiteboard/core/types/edge'

export const sameEdgeAnchor = (
  left: EdgeAnchor | undefined,
  right: EdgeAnchor | undefined
) => (
  left === right
  || (
    left?.side === right?.side
    && left?.offset === right?.offset
  )
)

export const sameEdgeEnd = (
  left: EdgeEnd | undefined,
  right: EdgeEnd | undefined
) => {
  if (left === right) {
    return true
  }

  if (!left || !right || left.kind !== right.kind) {
    return left === right
  }

  if (left.kind === 'point' && right.kind === 'point') {
    return isPointEqual(left.point, right.point)
  }

  if (left.kind === 'node' && right.kind === 'node') {
    return (
      left.nodeId === right.nodeId
      && sameEdgeAnchor(left.anchor, right.anchor)
    )
  }

  return false
}

export const sameResolvedEdgeEnd = (
  left: ResolvedEdgeEnd,
  right: ResolvedEdgeEnd
) => (
  sameEdgeEnd(left.end, right.end)
  && isPointEqual(left.point, right.point)
  && sameEdgeAnchor(left.anchor, right.anchor)
)

const sameManualRoutePoints = (
  left: Extract<Edge['route'], { kind: 'manual' }>['points'] | undefined,
  right: Extract<Edge['route'], { kind: 'manual' }>['points'] | undefined
) => {
  if (left === right) {
    return true
  }

  if (!left || !right || left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!isPointEqual(left[index], right[index])) {
      return false
    }
  }

  return true
}

export const sameEdgeRoute = (
  left: Edge['route'] | undefined,
  right: Edge['route'] | undefined
) => (
  left?.kind === right?.kind
  && sameManualRoutePoints(
    left?.kind === 'manual' ? left.points : undefined,
    right?.kind === 'manual' ? right.points : undefined
  )
)

export const sameEdgeLabel = (
  left: EdgeLabel | undefined,
  right: EdgeLabel | undefined
) => (
  left?.id === right?.id
  && left?.text === right?.text
  && left?.t === right?.t
  && left?.offset === right?.offset
  && left?.style?.size === right?.style?.size
  && left?.style?.weight === right?.style?.weight
  && left?.style?.italic === right?.style?.italic
  && left?.style?.color === right?.style?.color
  && left?.style?.bg === right?.style?.bg
)

export const sameEdgeLabels = (
  left: readonly EdgeLabel[] | undefined,
  right: readonly EdgeLabel[] | undefined
) => {
  if (left === right) {
    return true
  }

  if (!left || !right || left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!sameEdgeLabel(left[index], right[index])) {
      return false
    }
  }

  return true
}
