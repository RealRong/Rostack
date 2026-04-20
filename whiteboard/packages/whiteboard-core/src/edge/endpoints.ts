import { getRectCenter } from '@whiteboard/core/geometry'
import { readNodeRotation } from '@whiteboard/core/node'
import { getNodeAnchor } from '@whiteboard/core/node/outline'
import type { EdgeAnchor, EdgeEnd, Node, NodeGeometry, Point } from '@whiteboard/core/types'
import type {
  ResolveEdgeEndsInput,
  ResolvedEdgeEnd,
  ResolvedEdgeEnds
} from '@whiteboard/core/types/edge'
import { getAutoAnchorFromRect } from '@whiteboard/core/edge/anchor'
import { isNodeEdgeEnd } from '@whiteboard/core/edge/guards'

type ResolveNodeEndInput = {
  end: Extract<EdgeEnd, { kind: 'node' }>
  node: {
    node: Node
    geometry: NodeGeometry
  }
  otherPoint: Point
}

const resolveNodeEnd = ({
  end,
  node,
  otherPoint
}: ResolveNodeEndInput): ResolvedEdgeEnd => {
  const rotation = nodeApi.geometry.rotation(node.node)
  const auto = getAutoAnchorFromRect(
    node.node,
    node.geometry.rect,
    rotation,
    otherPoint
  )
  const anchor = end.anchor ?? auto.anchor
  const point = end.anchor
    ? getNodeAnchor(node.node, node.geometry.rect, anchor, rotation)
    : auto.point

  return {
    end,
    point,
    anchor
  }
}

const resolvePointEnd = (
  end: Extract<EdgeEnd, { kind: 'point' }>
): ResolvedEdgeEnd => ({
  end,
  point: end.point
})

export const resolveEdgeEnds = ({
  edge,
  source,
  target
}: ResolveEdgeEndsInput): ResolvedEdgeEnds | undefined => {
  const sourceRefPoint =
    isNodeEdgeEnd(edge.target)
      ? (target ? geometryApi.rect.center(target.geometry.rect) : undefined)
      : edge.target.point
  const targetRefPoint =
    isNodeEdgeEnd(edge.source)
      ? (source ? geometryApi.rect.center(source.geometry.rect) : undefined)
      : edge.source.point

  let resolvedSource: ResolvedEdgeEnd | undefined
  if (isNodeEdgeEnd(edge.source)) {
    if (!source || !sourceRefPoint) {
      return undefined
    }
    resolvedSource = resolveNodeEnd({
      end: edge.source,
      node: source,
      otherPoint: sourceRefPoint
    })
  } else {
    resolvedSource = resolvePointEnd(edge.source)
  }

  let resolvedTarget: ResolvedEdgeEnd | undefined
  if (isNodeEdgeEnd(edge.target)) {
    if (!target || !targetRefPoint) {
      return undefined
    }
    resolvedTarget = resolveNodeEnd({
      end: edge.target,
      node: target,
      otherPoint: targetRefPoint
    })
  } else {
    resolvedTarget = resolvePointEnd(edge.target)
  }

  return {
    source: resolvedSource,
    target: resolvedTarget
  }
}
