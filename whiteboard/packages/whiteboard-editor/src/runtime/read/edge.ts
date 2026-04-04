import { isPointEqual } from '@whiteboard/core/geometry'
import {
  applyEdgePatch,
  type EdgeConnectCandidate,
  type EdgeNodeCanvasSnapshot,
  matchEdgeRect,
  resolveEdgeView,
  type EdgeView as CoreEdgeView
} from '@whiteboard/core/edge'
import { isPointEdgeEnd } from '@whiteboard/core/types'
import type { EdgeId, Node, NodeId, NodeType, Rect } from '@whiteboard/core/types'
import {
  createKeyedDerivedStore,
  type EdgeItem,
  type EngineRead,
  type KeyedReadStore,
  type NodeItem
} from '@whiteboard/engine'
import type {
  EdgeOverlayProjection
} from '../overlay/types'
import {
  createOverlayStateStore,
  createPatchedItemStore
} from './keyed'

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

const toNodeCanvasSnapshot = (
  item: NodeItem
): EdgeNodeCanvasSnapshot => ({
  node: item.node,
  rect: item.rect,
  rotation: item.node.type === 'group'
    ? 0
    : (item.node.rotation ?? 0)
})

const isEdgeItemEqual = (
  left: EdgeItem | undefined,
  right: EdgeItem | undefined
) => (
  left === right
  || (
    left?.edge === right?.edge
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

const resolveEdgeCan = (
  edge: EdgeItem['edge']
): EdgeCapability => ({
  move: isPointEdgeEnd(edge.source) && isPointEdgeEnd(edge.target),
  reconnectSource: true,
  reconnectTarget: true,
  editRoute: true
})

export type EdgeRead = {
  list: EngineRead['edge']['list']
  item: KeyedReadStore<EdgeId, EdgeItem | undefined>
  state: KeyedReadStore<EdgeId, EdgeRuntimeState>
  resolved: KeyedReadStore<EdgeId, CoreEdgeView | undefined>
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

const createEdgeItemStore = ({
  read,
  overlay
}: {
  read: Pick<EngineRead, 'edge'>
  overlay: KeyedReadStore<EdgeId, EdgeOverlayProjection>
}): EdgeRead['item'] => createPatchedItemStore({
  source: read.edge.item,
  overlay,
  project: (entry, projection) => {
    const nextEdge = applyEdgePatch(entry.edge, projection.patch)
    return nextEdge === entry.edge
      ? entry
      : {
          ...entry,
          edge: nextEdge
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

    return resolveEdgeView({
      edge: entry.edge,
      source: source ? toNodeCanvasSnapshot(source) : undefined,
      target: target ? toNodeCanvasSnapshot(target) : undefined
    })
  }
})

export const createEdgeRead = ({
  read,
  nodeItem,
  overlay,
  capability
}: {
  read: Pick<EngineRead, 'edge' | 'index'>
  nodeItem: KeyedReadStore<string, NodeItem | undefined>
  overlay: KeyedReadStore<EdgeId, EdgeOverlayProjection>
  capability: (node: Pick<Node, 'type'> | NodeType) => {
    connect: boolean
  }
}): EdgeRead => {
  const item = createEdgeItemStore({
    read,
    overlay
  })
  const state = createEdgeStateStore({
    overlay
  })
  const resolved = createEdgeResolvedStore({
    item,
    nodeItem
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
        rect: entry.rect,
        aabb: entry.aabb,
        rotation: entry.rotation
      })
    }

    return candidates
  }

  return {
    list: read.edge.list,
    item,
    state,
    resolved,
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
