import { isPointEqual } from '@whiteboard/core/geometry'
import {
  getEdgePathBounds,
  isNodeEdgeEnd,
  isPointEdgeEnd,
  sameEdgeAnchor,
  sameResolvedEdgeEnd,
  type EdgeConnectCandidate,
  matchEdgeRect,
  type EdgeView as CoreEdgeView
} from '@whiteboard/core/edge'
import {
  sameOptionalRect as isSameOptionalRectTuple,
  sameOrder as isOrderedArrayEqual,
  samePointArray as isSamePointArray
} from '@shared/core'
import type { Edge, EdgeId, Node, NodeId, NodeType, Rect } from '@whiteboard/core/types'
import {
  type EdgeItem,
  type EngineRead
} from '@whiteboard/engine'
import {
  createKeyedDerivedStore,
  presentValues,
  read as readValue,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type {
  EdgeFeedbackProjection
} from '@whiteboard/editor/local/feedback/types'
import type { NodeCanvasSnapshot, NodePresentationRead } from '@whiteboard/editor/query/node/read'
import type { EditSession } from '@whiteboard/editor/local/session/edit'
import {
  projectEdgeItem,
  readProjectedEdgeView
} from '@whiteboard/editor/query/edge/projection'

export type EdgeRuntimeState = {
  patched: boolean
  activeRouteIndex?: number
}

export type EdgeCapability = {
  move: boolean
  reconnectSource: boolean
  reconnectTarget: boolean
  editRoute: boolean
  editLabel: boolean
}

export type EdgeBox = {
  rect: Rect
  pad: number
}

export type EdgeView = CoreEdgeView & {
  edgeId: EdgeId
  edge: EdgeItem['edge']
  patched: boolean
  activeRouteIndex: number | undefined
}

const EDGE_CAPABILITY_BASE = {
  reconnectSource: true,
  reconnectTarget: true,
  editRoute: true,
  editLabel: true
} as const

const isEdgeItemEqual = (
  left: EdgeItem | undefined,
  right: EdgeItem | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.id === right.id
    && left.edge === right.edge
    && left?.ends.source.end.kind === right?.ends.source.end.kind
    && left?.ends.target.end.kind === right?.ends.target.end.kind
    && sameEdgeAnchor(left?.ends.source.anchor, right?.ends.source.anchor)
    && sameEdgeAnchor(left?.ends.target.anchor, right?.ends.target.anchor)
    && isPointEqual(left?.ends.source.point, right?.ends.source.point)
    && isPointEqual(left?.ends.target.point, right?.ends.target.point)
  )
)

const isEdgePathSegmentEqual = (
  left: CoreEdgeView['path']['segments'][number],
  right: CoreEdgeView['path']['segments'][number]
) => (
  left === right
  || (
    left.role === right.role
    && left.insertIndex === right.insertIndex
    && isPointEqual(left.from, right.from)
    && isPointEqual(left.to, right.to)
    && isPointEqual(left.insertPoint, right.insertPoint)
    && isSamePointArray(left.hitPoints, right.hitPoints)
  )
)

const isEdgeHandleEqual = (
  left: CoreEdgeView['handles'][number],
  right: CoreEdgeView['handles'][number]
) => {
  if (left === right) {
    return true
  }
  if (left.kind !== right.kind) {
    return false
  }
  if (!isPointEqual(left.point, right.point)) {
    return false
  }

  switch (left.kind) {
    case 'end':
      return right.kind === 'end' && left.end === right.end
    case 'anchor':
      return (
        right.kind === 'anchor'
        && left.index === right.index
        && left.mode === right.mode
      )
    case 'segment':
      return (
        right.kind === 'segment'
        && left.role === right.role
        && left.insertIndex === right.insertIndex
        && left.segmentIndex === right.segmentIndex
        && left.axis === right.axis
      )
  }
}

const isEdgeViewEqual = (
  left: CoreEdgeView | undefined,
  right: CoreEdgeView | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && sameResolvedEdgeEnd(left.ends.source, right.ends.source)
    && sameResolvedEdgeEnd(left.ends.target, right.ends.target)
    && left.path.svgPath === right.path.svgPath
    && isSamePointArray(left.path.points, right.path.points)
    && isPointEqual(left.path.label, right.path.label)
    && isOrderedArrayEqual(
      left.path.segments,
      right.path.segments,
      isEdgePathSegmentEqual
    )
    && isOrderedArrayEqual(
      left.handles,
      right.handles,
      isEdgeHandleEqual
    )
  )
)

const resolveEdgeCapability = (
  edge: EdgeItem['edge'],
  readNodeLocked: (nodeId: NodeId) => boolean
): EdgeCapability => {
  const locked = Boolean(edge.locked)
  const relationLocked = [edge.source, edge.target].some((end) => (
    isNodeEdgeEnd(end) && readNodeLocked(end.nodeId)
  ))
  const canEdit = !locked

  return {
    ...EDGE_CAPABILITY_BASE,
    reconnectSource: canEdit && !relationLocked,
    reconnectTarget: canEdit && !relationLocked,
    editRoute: canEdit,
    editLabel: canEdit,
    move: canEdit && isPointEdgeEnd(edge.source) && isPointEdgeEnd(edge.target)
  }
}

export type EdgePresentationRead = {
  list: EngineRead['edge']['list']
  committed: EngineRead['edge']['item']
  item: KeyedReadStore<EdgeId, EdgeItem | undefined>
  edges: (edgeIds: readonly EdgeId[]) => readonly Edge[]
  state: KeyedReadStore<EdgeId, EdgeRuntimeState>
  resolved: KeyedReadStore<EdgeId, CoreEdgeView | undefined>
  view: KeyedReadStore<EdgeId, EdgeView | undefined>
  bounds: KeyedReadStore<EdgeId, Rect | undefined>
  box: (edgeId: EdgeId) => EdgeBox | undefined
  capability: (edge: EdgeItem['edge']) => EdgeCapability
  related: (nodeIds: Iterable<NodeId>) => readonly EdgeId[]
  idsInRect: (rect: Rect, options?: {
    match?: 'touch' | 'contain'
  }) => EdgeId[]
  connectCandidates: (rect: Rect) => readonly EdgeConnectCandidate[]
}

const isEdgeStateEqual = (
  left: EdgeRuntimeState,
  right: EdgeRuntimeState
) => (
  left.patched === right.patched
  && left.activeRouteIndex === right.activeRouteIndex
)

const toEdgeRuntimeState = (
  feedback: EdgeFeedbackProjection
): EdgeRuntimeState => ({
  patched: Boolean(feedback.patch),
  activeRouteIndex: feedback.activeRouteIndex
})

const isEdgeViewStateEqual = (
  left: EdgeView | undefined,
  right: EdgeView | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && left.edgeId === right.edgeId
    && left.edge === right.edge
    && left.patched === right.patched
    && left.activeRouteIndex === right.activeRouteIndex
    && isEdgeViewEqual(left, right)
  )
)

const readEdgeBox = (
  rect: Rect | undefined,
  edge: EdgeItem['edge'] | undefined
): EdgeBox | undefined => {
  if (!rect || !edge) {
    return undefined
  }

  return {
    rect,
    pad: Math.max(24, (edge.style?.width ?? 2) + 16)
  }
}

export const createEdgeRead = ({
  read,
  node,
  feedback,
  edit,
  capability
}: {
  read: Pick<EngineRead, 'edge'>
  node: Pick<NodePresentationRead, 'canvas' | 'idsInRect'>
  feedback: KeyedReadStore<EdgeId, EdgeFeedbackProjection>
  edit: ReadStore<EditSession>
  capability: (node: Pick<Node, 'type'> | NodeType) => {
    connect: boolean
  }
}): EdgePresentationRead => {
  const item: EdgePresentationRead['item'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const entry = readValue(read.edge.item, edgeId)
      return entry
        ? projectEdgeItem(entry, readValue(feedback, edgeId), readValue(edit))
        : undefined
    },
    isEqual: isEdgeItemEqual
  })
  const state: EdgePresentationRead['state'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => toEdgeRuntimeState(
      readValue(feedback, edgeId)
    ),
    isEqual: isEdgeStateEqual
  })
  const resolved: EdgePresentationRead['resolved'] = createKeyedDerivedStore({
    isEqual: isEdgeViewEqual,
    get: (edgeId: EdgeId) => {
      const entry = readValue(item, edgeId)
      return entry
        ? readProjectedEdgeView(node, entry)
        : undefined
    }
  })
  const view: EdgePresentationRead['view'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const resolvedItem = readValue(item, edgeId)
      const resolvedView = readValue(resolved, edgeId)
      if (!resolvedItem || !resolvedView) {
        return undefined
      }

      return {
        edgeId,
        edge: resolvedItem.edge,
        patched: readValue(state, edgeId).patched,
        activeRouteIndex: readValue(state, edgeId).activeRouteIndex,
        ...resolvedView
      }
    },
    isEqual: isEdgeViewStateEqual
  })
  const bounds: EdgePresentationRead['bounds'] = createKeyedDerivedStore({
    get: (edgeId: EdgeId) => {
      const resolvedEntry = readValue(resolved, edgeId)
      return resolvedEntry
        ? getEdgePathBounds(resolvedEntry.path)
        : undefined
    },
    isEqual: isSameOptionalRectTuple
  })

  const connectCandidates: EdgePresentationRead['connectCandidates'] = (
    rect
  ) => {
    const nodeIds = node.idsInRect(rect)
    const candidates: EdgeConnectCandidate[] = []

    for (let index = 0; index < nodeIds.length; index += 1) {
      const snapshot = readValue(node.canvas, nodeIds[index])
      if (!snapshot || !capability(snapshot.node).connect) {
        continue
      }

      candidates.push({
        nodeId: snapshot.node.id,
        node: snapshot.node,
        geometry: snapshot.geometry
      })
    }

    return candidates
  }
  const readNodeLocked = (
    nodeId: NodeId
  ) => Boolean(readValue(node.canvas, nodeId)?.node.locked)

  return {
    list: read.edge.list,
    committed: read.edge.item,
    item,
    edges: (edgeIds) => presentValues(edgeIds, (edgeId) => readValue(item, edgeId)?.edge),
    state,
    resolved,
    view,
    bounds,
    box: (edgeId) => readEdgeBox(
      readValue(bounds, edgeId),
      readValue(item, edgeId)?.edge
    ),
    capability: (edge) => resolveEdgeCapability(edge, readNodeLocked),
    related: read.edge.related,
    idsInRect: (rect, options) => readValue(read.edge.list).filter((edgeId) => {
      const nextResolved = readValue(resolved, edgeId)
      if (!nextResolved) {
        return false
      }

      return matchEdgeRect({
        path: nextResolved.path,
        queryRect: rect,
        mode: options?.match ?? 'touch'
      })
    }),
    connectCandidates
  }
}
