import { entityTable } from '@shared/core'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
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
    return geometryApi.equal.point(left.point, right.point)
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
  && geometryApi.equal.point(left.point, right.point)
  && sameEdgeAnchor(left.anchor, right.anchor)
)

const sameEdgePoints = (
  left: Edge['points'] | undefined,
  right: Edge['points'] | undefined
) => {
  const leftPoints = left ? entityTable.read.list(left) : undefined
  const rightPoints = right ? entityTable.read.list(right) : undefined
  if (left === right) {
    return true
  }

  if (!leftPoints || !rightPoints || leftPoints.length !== rightPoints.length) {
    return false
  }

  for (let index = 0; index < leftPoints.length; index += 1) {
    if (!geometryApi.equal.point(leftPoints[index], rightPoints[index])) {
      return false
    }
  }

  return true
}

export const sameEdgePointsValue = (
  left: Edge['points'] | undefined,
  right: Edge['points'] | undefined
) => sameEdgePoints(left, right)

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
  left: import('@shared/core').EntityTable<string, EdgeLabel> | undefined,
  right: import('@shared/core').EntityTable<string, EdgeLabel> | undefined
) => {
  const leftLabels = left ? entityTable.read.list(left) : undefined
  const rightLabels = right ? entityTable.read.list(right) : undefined
  if (left === right) {
    return true
  }

  if (!leftLabels || !rightLabels || leftLabels.length !== rightLabels.length) {
    return false
  }

  for (let index = 0; index < leftLabels.length; index += 1) {
    if (!sameEdgeLabel(leftLabels[index], rightLabels[index])) {
      return false
    }
  }

  return true
}
