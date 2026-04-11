import { isPointEqual } from '@whiteboard/core/geometry'
import {
  applyEdgePatch,
  getEdgePathBounds,
  isPointEdgeEnd,
  type EdgeConnectCandidate,
  type EdgeNodeCanvasSnapshot,
  matchEdgeRect,
  resolveEdgeView,
  type EdgeView as CoreEdgeView
} from '@whiteboard/core/edge'
import { getNodeGeometry } from '@whiteboard/core/node'
import {
  sameOrder as isOrderedArrayEqual,
  samePointArray as isSamePointArray
} from '@shared/equality'
import type { EdgeId, Node, NodeId, NodeType, Rect } from '@whiteboard/core/types'
import {
  type EdgeItem,
  type EngineRead,
  type NodeItem
} from '@whiteboard/engine'
import {
  createKeyedDerivedStore,
  type KeyedReadStore,
  type ReadStore
} from '@shared/store'
import type {
  EdgeOverlayProjection
} from '../overlay/types'
import {
  createOverlayStateStore,
  createPatchedItemStore
} from './keyed'
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

const toNodeCanvasSnapshot = (
  item: NodeItem
): EdgeNodeCanvasSnapshot => ({
  node: item.node,
  geometry: getNodeGeometry(
    item.node,
    item.rect,
    item.node.rotation ?? 0
  )
})

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

const resolveEdgeCan = (
  edge: EdgeItem['edge']
): EdgeCapability => ({
  move: isPointEdgeEnd(edge.source) && isPointEdgeEnd(edge.target),
  reconnectSource: true,
  reconnectTarget: true,
  editRoute: true
})

const readEdgeBox = (
  entry: CoreEdgeView | undefined,
  edge: EdgeItem['edge'] | undefined
): EdgeBox | undefined => {
  if (!entry || !edge) {
    return undefined
  }

  const rect = getEdgePathBounds(entry.path)
  if (!rect) {
    return undefined
  }

  return {
    rect,
    pad: Math.max(24, (edge.style?.width ?? 2) + 16)
  }
}

export type EdgeRead = {
  list: EngineRead['edge']['list']
  item: KeyedReadStore<EdgeId, EdgeItem | undefined>
  state: KeyedReadStore<EdgeId, EdgeRuntimeState>
  resolved: KeyedReadStore<EdgeId, CoreEdgeView | undefined>
  view: KeyedReadStore<EdgeId, EdgeView | undefined>
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

const createEdgeItemStore = ({
  read,
  overlay,
  edit
}: {
  read: Pick<EngineRead, 'edge'>
  overlay: KeyedReadStore<EdgeId, EdgeOverlayProjection>
  edit: ReadStore<EditSession>
}): EdgeRead['item'] => createPatchedItemStore({
  source: read.edge.item,
  overlay,
  project: (entry, projection, readStore) => {
    const nextEdge = applyEdgePatch(entry.edge, projection.patch)
    const session = readStore(edit)
    if (
      !session
      || session.kind !== 'edge-label'
      || session.edgeId !== entry.edge.id
    ) {
      return nextEdge === entry.edge
        ? entry
        : {
            ...entry,
            edge: nextEdge
          }
    }

    const nextLabels = nextEdge.labels?.map((label) => (
      label.id !== session.labelId
        ? label
        : {
            ...label,
            text: session.draft.text
          }
    ))

    return {
      ...entry,
      edge: {
        ...nextEdge,
        ...(nextLabels ? { labels: nextLabels } : {})
      }
    }
  },
  isEqual: isEdgeItemEqual
})

const createEdgeStateStore = ({
  overlay
}: {
  overlay: KeyedReadStore<EdgeId, EdgeOverlayProjection>
}): EdgeRead['state'] => createOverlayStateStore({
  overlay,
  project: toEdgeRuntimeState,
  isEqual: isEdgeStateEqual
})

const createEdgeResolvedStore = ({
  item,
  nodeItem
}: {
  item: EdgeRead['item']
  nodeItem: KeyedReadStore<string, NodeItem | undefined>
}): EdgeRead['resolved'] => createKeyedDerivedStore({
  isEqual: isEdgeViewEqual,
  get: (readStore, edgeId: EdgeId) => {
    const entry = readStore(item, edgeId)
    if (!entry) {
      return undefined
    }

    const source =
      entry.edge.source.kind === 'node'
        ? readStore(nodeItem, entry.edge.source.nodeId)
        : undefined
    const target =
      entry.edge.target.kind === 'node'
        ? readStore(nodeItem, entry.edge.target.nodeId)
        : undefined

    if (
      (entry.edge.source.kind === 'node' && !source)
      || (entry.edge.target.kind === 'node' && !target)
    ) {
      return undefined
    }

    try {
      return resolveEdgeView({
        edge: entry.edge,
        source: source ? toNodeCanvasSnapshot(source) : undefined,
        target: target ? toNodeCanvasSnapshot(target) : undefined
      })
    } catch {
      return undefined
    }
  }
})

const createEdgeViewStore = ({
  item,
  state,
  resolved
}: {
  item: EdgeRead['item']
  state: EdgeRead['state']
  resolved: EdgeRead['resolved']
}): EdgeRead['view'] => createKeyedDerivedStore({
  get: (readStore, edgeId: EdgeId) => {
    const resolvedItem = readStore(item, edgeId)
    const resolvedView = readStore(resolved, edgeId)
    if (!resolvedItem || !resolvedView) {
      return undefined
    }

    const resolvedState = readStore(state, edgeId)
    return {
      edgeId,
      edge: resolvedItem.edge,
      patched: resolvedState.patched,
      activeRouteIndex: resolvedState.activeRouteIndex,
      ...resolvedView
    }
  },
  isEqual: isEdgeViewStateEqual
})

export const createEdgeRead = ({
  read,
  nodeItem,
  overlay,
  edit,
  capability
}: {
  read: Pick<EngineRead, 'edge' | 'index'>
  nodeItem: KeyedReadStore<string, NodeItem | undefined>
  overlay: KeyedReadStore<EdgeId, EdgeOverlayProjection>
  edit: ReadStore<EditSession>
  capability: (node: Pick<Node, 'type'> | NodeType) => {
    connect: boolean
  }
}): EdgeRead => {
  const item = createEdgeItemStore({
    read,
    overlay,
    edit
  })
  const state = createEdgeStateStore({
    overlay
  })
  const resolved = createEdgeResolvedStore({
    item,
    nodeItem
  })
  const view = createEdgeViewStore({
    item,
    state,
    resolved
  })

  const readResolved = (edgeId: EdgeId) => resolved.get(edgeId)
  const connectCandidates: EdgeRead['connectCandidates'] = (
    rect
  ) => {
    const nodeIds = read.index.node.idsInRect(rect)
    const candidates: EdgeConnectCandidate[] = []

    for (let index = 0; index < nodeIds.length; index += 1) {
      const entry = read.index.node.get(nodeIds[index])
      if (!entry || !capability(entry.node).connect) {
        continue
      }

      candidates.push({
        nodeId: entry.node.id,
        node: entry.node,
        geometry: entry.geometry
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
    box: (edgeId) => readEdgeBox(
      readResolved(edgeId),
      item.get(edgeId)?.edge
    ),
    capability: resolveEdgeCan,
    related: read.edge.related,
    idsInRect: (rect, options) => read.edge.list.get().filter((edgeId) => {
      const nextResolved = readResolved(edgeId)
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
