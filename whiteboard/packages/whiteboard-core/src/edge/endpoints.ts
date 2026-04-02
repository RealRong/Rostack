import { getRectCenter } from '../geometry'
import { getNodeAnchorPoint } from '../node/outline'
import type { EdgeAnchor, EdgeEnd, Node, Point, Rect } from '../types/core'
import { isNodeEdgeEnd } from '../types/core'
import type {
  ResolveEdgeEndsInput,
  ResolvedEdgeEnd,
  ResolvedEdgeEnds
} from '../types/edge'
import { getAutoAnchorFromRect } from './anchor'

type ResolveNodeEndInput = {
  end: Extract<EdgeEnd, { kind: 'node' }>
  node: {
    node: Pick<Node, 'type' | 'data'>
    rect: Rect
    rotation?: number
  }
  otherPoint: Point
}

const resolveNodeEnd = ({
  end,
  node,
  otherPoint
}: ResolveNodeEndInput): ResolvedEdgeEnd => {
  const rotation = node.rotation ?? 0
  const auto = getAutoAnchorFromRect(
    node.node,
    node.rect,
    rotation,
    otherPoint
  )
  const anchor = end.anchor ?? auto.anchor
  const point = end.anchor
    ? getNodeAnchorPoint(node.node, node.rect, anchor, rotation)
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
      ? (target ? getRectCenter(target.rect) : undefined)
      : edge.target.point
  const targetRefPoint =
    isNodeEdgeEnd(edge.source)
      ? (source ? getRectCenter(source.rect) : undefined)
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
