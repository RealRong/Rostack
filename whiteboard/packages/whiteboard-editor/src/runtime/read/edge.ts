import { isPointEqual } from '@whiteboard/core/geometry'
import {
  applyEdgePatch,
  getEdgePathBounds,
  isPointEdgeEnd,
  type EdgeConnectCandidate,
  matchEdgeRect,
  resolveEdgeView,
  type EdgeView as CoreEdgeView
} from '@whiteboard/core/edge'
import {
  sameOptionalRect as isSameOptionalRectTuple,
  sameOrder as isOrderedArrayEqual,
  samePointArray as isSamePointArray
} from '@shared/core'
import type { EdgeId, Node, NodeId, NodeType, Rect } from '@whiteboard/core/types'
import {
  type EdgeItem,
  type EngineRead
} from '@whiteboard/engine'
import {
  createKeyedDerivedStore,
  type KeyedReadStore,
  type ReadFn,
  type ReadStore
} from '@shared/core'
import type {
  EdgeOverlayProjection
} from '../overlay/types'
import type { NodeCanvasSnapshot, NodeRead } from './node'
import {
  type EditSession
} from '../state/edit'

export type EdgeRuntimeState = {
  patched: boolean
  activeRouteIndex?: number
}

export type EdgeCapability = {
  move: boolean
  reconnectSource: boolean
  reconnectTarget: boolean
  editRoute: boolean
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
  editRoute: true
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
    && left?.ends.source.anchor?.side === right?.ends.source.anchor?.side
    && left?.ends.target.anchor?.side === right?.ends.target.anchor?.side
    && left?.ends.source.anchor?.offset === right?.ends.source.anchor?.offset
    && left?.ends.target.anchor?.offset === right?.ends.target.anchor?.offset
    && isPointEqual(left?.ends.source.point, right?.ends.source.point)
    && isPointEqual(left?.ends.target.point, right?.ends.target.point)
  )
)

const isEdgeAnchorEqual = (
  left: EdgeItem['ends']['source']['anchor'],
  right: EdgeItem['ends']['source']['anchor']
) => (
  left === right
  || (
    left?.side === right?.side
    && left?.offset === right?.offset
  )
)

const isEdgeEndEqual = (
  left: CoreEdgeView['ends']['source']['end'],
  right: CoreEdgeView['ends']['source']['end']
) => {
  if (left === right) {
    return true
  }
  if (left.kind !== right.kind) {
    return false
  }
  if (left.kind === 'point' && right.kind === 'point') {
    return isPointEqual(left.point, right.point)
  }
  if (left.kind === 'node' && right.kind === 'node') {
    return left.nodeId === right.nodeId
  }
  return false
}

const isResolvedEdgeEndEqual = (
  left: CoreEdgeView['ends']['source'],
  right: CoreEdgeView['ends']['source']
) => (
  isEdgeEndEqual(left.end, right.end)
  && isPointEqual(left.point, right.point)
  && isEdgeAnchorEqual(left.anchor, right.anchor)
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
    && isResolvedEdgeEndEqual(left.ends.source, right.ends.source)
    && isResolvedEdgeEndEqual(left.ends.target, right.ends.target)
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
  edge: EdgeItem['edge']
): EdgeCapability => ({
  ...EDGE_CAPABILITY_BASE,
  move: isPointEdgeEnd(edge.source) && isPointEdgeEnd(edge.target)
})

export type EdgeRead = {
  list: EngineRead['edge']['list']
  item: KeyedReadStore<EdgeId, EdgeItem | undefined>
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
  projection: EdgeOverlayProjection
): EdgeRuntimeState => ({
  patched: Boolean(projection.patch),
  activeRouteIndex: projection.activeRouteIndex
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

const applyEdgeEditSession = (
  edge: EdgeItem['edge'],
  session: EditSession
): EdgeItem['edge'] => {
  if (
    !session
    || session.kind !== 'edge-label'
    || session.edgeId !== edge.id
  ) {
    return edge
  }

  const nextLabels = edge.labels?.map((label) => (
    label.id !== session.labelId
      ? label
      : {
          ...label,
          text: session.draft.text
        }
  ))

  return nextLabels
    ? {
        ...edge,
        labels: nextLabels
      }
    : edge
}

const readEdgeItem = (
  entry: EdgeItem,
  projection: EdgeOverlayProjection,
  session: EditSession
) => {
  const nextEdge = applyEdgeEditSession(
    applyEdgePatch(entry.edge, projection.patch),
    session
  )

  return nextEdge === entry.edge
    ? entry
    : {
        ...entry,
        edge: nextEdge
      }
}

const readResolvedNodeSnapshot = (
  readNode: Pick<NodeRead, 'canvas'>,
  readStore: ReadFn,
  edgeEnd: EdgeItem['edge']['source'] | EdgeItem['edge']['target']
) => edgeEnd.kind === 'node'
  ? readStore(readNode.canvas, edgeEnd.nodeId)
  : undefined

const readResolvedEdgeView = (
  readStore: ReadFn,
  node: Pick<NodeRead, 'canvas'>,
  entry: EdgeItem
) => {
  const source = readResolvedNodeSnapshot(node, readStore, entry.edge.source)
  const target = readResolvedNodeSnapshot(node, readStore, entry.edge.target)

  if (
    (entry.edge.source.kind === 'node' && !source)
    || (entry.edge.target.kind === 'node' && !target)
  ) {
    return undefined
  }

  try {
    return resolveEdgeView({
      edge: entry.edge,
      source,
      target
    })
  } catch {
    return undefined
  }
}

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
  overlay,
  edit,
  capability
}: {
  read: Pick<EngineRead, 'edge'>
  node: Pick<NodeRead, 'canvas' | 'idsInRect'>
  overlay: KeyedReadStore<EdgeId, EdgeOverlayProjection>
  edit: ReadStore<EditSession>
  capability: (node: Pick<Node, 'type'> | NodeType) => {
    connect: boolean
  }
}): EdgeRead => {
  const item: EdgeRead['item'] = createKeyedDerivedStore({
    get: (readStore, edgeId: EdgeId) => {
      const entry = readStore(read.edge.item, edgeId)
      return entry
        ? readEdgeItem(entry, readStore(overlay, edgeId), readStore(edit))
        : undefined
    },
    isEqual: isEdgeItemEqual
  })
  const state: EdgeRead['state'] = createKeyedDerivedStore({
    get: (readStore, edgeId: EdgeId) => toEdgeRuntimeState(
      readStore(overlay, edgeId)
    ),
    isEqual: isEdgeStateEqual
  })
  const resolved: EdgeRead['resolved'] = createKeyedDerivedStore({
    isEqual: isEdgeViewEqual,
    get: (readStore, edgeId: EdgeId) => {
      const entry = readStore(item, edgeId)
      return entry
        ? readResolvedEdgeView(readStore, node, entry)
        : undefined
    }
  })
  const view: EdgeRead['view'] = createKeyedDerivedStore({
    get: (readStore, edgeId: EdgeId) => {
      const resolvedItem = readStore(item, edgeId)
      const resolvedView = readStore(resolved, edgeId)
      if (!resolvedItem || !resolvedView) {
        return undefined
      }

      return {
        edgeId,
        edge: resolvedItem.edge,
        patched: readStore(state, edgeId).patched,
        activeRouteIndex: readStore(state, edgeId).activeRouteIndex,
        ...resolvedView
      }
    },
    isEqual: isEdgeViewStateEqual
  })
  const bounds: EdgeRead['bounds'] = createKeyedDerivedStore({
    get: (readStore, edgeId: EdgeId) => {
      const resolvedEntry = readStore(resolved, edgeId)
      return resolvedEntry
        ? getEdgePathBounds(resolvedEntry.path)
        : undefined
    },
    isEqual: isSameOptionalRectTuple
  })

  const connectCandidates: EdgeRead['connectCandidates'] = (
    rect
  ) => {
    const nodeIds = node.idsInRect(rect)
    const candidates: EdgeConnectCandidate[] = []

    for (let index = 0; index < nodeIds.length; index += 1) {
      const snapshot = node.canvas.get(nodeIds[index])
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

  return {
    list: read.edge.list,
    item,
    state,
    resolved,
    view,
    bounds,
    box: (edgeId) => readEdgeBox(
      bounds.get(edgeId),
      item.get(edgeId)?.edge
    ),
    capability: resolveEdgeCapability,
    related: read.edge.related,
    idsInRect: (rect, options) => read.edge.list.get().filter((edgeId) => {
      const nextResolved = resolved.get(edgeId)
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
