import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  MindmapId,
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import type { Read, Runtime } from '../contracts/editor'
import type {
  GraphState,
  IndexState
} from '../contracts/working'
import {
  readGroupSignatureFromTarget,
  readRelatedEdgeIds,
  readTreeDescendants
} from '../domain/indexes'
import type { SpatialIndexState } from '../domain/spatial/state'
import { createSpatialRead } from '../domain/spatial/query'

type Candidate = {
  id: NodeId
  order: number
  area: number
}

const readArea = (
  rect: Rect
) => rect.width * rect.height

const pickCandidate = (
  current: Candidate | undefined,
  next: Candidate
) => {
  if (!current) {
    return next
  }
  if (next.area < current.area) {
    return next
  }
  if (next.area > current.area) {
    return current
  }

  return next.order > current.order
    ? next
    : current
}

const isFrameView = (
  graph: GraphState,
  nodeId: NodeId
) => graph.nodes.get(nodeId)?.base.node.type === 'frame'

const readFrameRect = (
  graph: GraphState,
  nodeId: NodeId
) => {
  const view = graph.nodes.get(nodeId)
  return view?.base.node.type === 'frame'
    ? view.geometry.rect
    : undefined
}

const contains = (
  outer: Rect,
  inner: Rect
) => geometryApi.rect.contains(outer, inner)

const containsPoint = (
  rect: Rect,
  point: Point
) => geometryApi.rect.containsPoint(point, rect)

const createFrameRead = (input: {
  graph: () => GraphState
  spatial: Read['spatial']
  indexes: () => IndexState
}): Read['frame'] => {
  const point: Read['frame']['point'] = (worldPoint) => input.spatial.point(worldPoint, {
    kinds: ['node']
  }).flatMap((record) => {
    if (record.item.kind !== 'node' || !isFrameView(input.graph(), record.item.id)) {
      return []
    }

    return [record.item.id]
  })

  const rect: Read['frame']['rect'] = (worldRect) => input.spatial.rect(worldRect, {
    kinds: ['node']
  }).flatMap((record) => {
    if (record.item.kind !== 'node') {
      return []
    }

    const frameRect = readFrameRect(input.graph(), record.item.id)
    return frameRect && contains(frameRect, worldRect)
      ? [record.item.id]
      : []
  })

  const pick: Read['frame']['pick'] = (worldPoint, options) => {
    const exclude = options?.excludeIds?.length
      ? new Set(options.excludeIds)
      : undefined
    let best: Candidate | undefined

    input.spatial.point(worldPoint, {
      kinds: ['node']
    }).forEach((record) => {
      if (record.item.kind !== 'node' || exclude?.has(record.item.id)) {
        return
      }

      const frameRect = readFrameRect(input.graph(), record.item.id)
      if (!frameRect || !containsPoint(frameRect, worldPoint)) {
        return
      }

      best = pickCandidate(best, {
        id: record.item.id,
        order: record.order,
        area: readArea(frameRect)
      })
    })

    return best?.id
  }

  const parent: Read['frame']['parent'] = (nodeId, options) => {
    const exclude = options?.excludeIds?.length
      ? new Set(options.excludeIds)
      : undefined
    const rect = input.graph().nodes.get(nodeId)?.geometry.rect
    if (!rect) {
      return undefined
    }

    let best: Candidate | undefined
    input.spatial.rect(rect, {
      kinds: ['node']
    }).forEach((record) => {
      if (record.item.kind !== 'node') {
        return
      }

      if (record.item.id === nodeId || exclude?.has(record.item.id)) {
        return
      }

      const frameRect = readFrameRect(input.graph(), record.item.id)
      if (!frameRect || !contains(frameRect, rect)) {
        return
      }

      best = pickCandidate(best, {
        id: record.item.id,
        order: record.order,
        area: readArea(frameRect)
      })
    })

    return best?.id
  }

  return {
    point,
    rect,
    pick,
    parent,
    descendants: (nodeIds) => readTreeDescendants(input.indexes(), nodeIds)
  }
}

const resolveMindmapId = (
  graph: GraphState,
  indexes: IndexState,
  value: string
): MindmapId | undefined => {
  if (graph.owners.mindmaps.has(value as MindmapId)) {
    return value as MindmapId
  }

  const owner = indexes.ownerByNode.get(value as NodeId)
  return owner?.kind === 'mindmap'
    ? owner.id
    : undefined
}

export const createEditorGraphQuery = (
  runtime: {
    snapshot: Runtime['snapshot']
    spatial: () => SpatialIndexState
    graph: () => GraphState
    indexes: () => IndexState
  }
): Read => {
  const spatial = createSpatialRead({
    state: runtime.spatial
  })
  const frame = createFrameRead({
    graph: runtime.graph,
    spatial,
    indexes: runtime.indexes
  })

  return {
    snapshot: () => runtime.snapshot(),
    node: (id) => runtime.snapshot().graph.nodes.byId.get(id),
    edge: (id) => runtime.snapshot().graph.edges.byId.get(id),
    mindmap: (id) => runtime.snapshot().graph.owners.mindmaps.byId.get(id),
    group: (id) => runtime.snapshot().graph.owners.groups.byId.get(id),
    mindmapId: (value) => resolveMindmapId(
      runtime.graph(),
      runtime.indexes(),
      value
    ),
    mindmapStructure: (value) => {
      const mindmapId = resolveMindmapId(
        runtime.graph(),
        runtime.indexes(),
        value
      )
      return mindmapId
        ? runtime.graph().owners.mindmaps.get(mindmapId)?.structure
        : undefined
    },
    relatedEdges: (nodeIds) => readRelatedEdgeIds(runtime.indexes(), nodeIds),
    groupExact: (target: SelectionTarget) => {
      const normalized = selectionApi.target.normalize(target)
      const signature = readGroupSignatureFromTarget(normalized)
      return runtime.indexes().groupIdsBySignature.get(signature) ?? []
    },
    nodeUi: (id) => runtime.snapshot().ui.nodes.byId.get(id),
    edgeUi: (id) => runtime.snapshot().ui.edges.byId.get(id),
    spatial,
    snap: (rect) => nodeApi.snap.buildCandidates(
      spatial.rect(rect, {
        kinds: ['node']
      }).flatMap((record) => {
        if (record.item.kind !== 'node') {
          return []
        }

        const view = runtime.graph().nodes.get(record.item.id)
        return view
          ? [{
              id: record.item.id,
              rect: view.geometry.rect
            }]
          : []
      })
    ),
    frame,
    items: () => runtime.snapshot().items,
    ui: () => runtime.snapshot().ui,
    chrome: () => runtime.snapshot().ui.chrome
  }
}
