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
  readGroupSignatureFromTarget
} from '../domain/group'
import {
  readRelatedEdgeIds,
  readTreeDescendants
} from '../domain/index/read'
import type { SpatialIndexState } from '../domain/spatial/state'
import { createSpatialRead } from '../domain/spatial/query'

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

const readFrameCandidates = (input: {
  graph: GraphState
  records: ReturnType<Read['spatial']['point']> | ReturnType<Read['spatial']['rect']>
}): readonly {
  id: NodeId
  rect: Rect
  order: number
}[] => input.records.flatMap((record) => {
  if (record.item.kind !== 'node') {
    return []
  }

  const rect = readFrameRect(input.graph, record.item.id)
  return rect
    ? [{
        id: record.item.id,
        rect,
        order: record.order
      }]
    : []
})

const createFrameRead = (input: {
  graph: () => GraphState
  spatial: Read['spatial']
  indexes: () => IndexState
}): Read['frame'] => ({
  point: (point) => input.spatial.point(point, {
    kinds: ['node']
  }).flatMap((record) => record.item.kind === 'node' && isFrameView(input.graph(), record.item.id)
    ? [record.item.id]
    : []),
  rect: (rect) => input.spatial.rect(rect, {
    kinds: ['node']
  }).flatMap((record) => {
    if (record.item.kind !== 'node') {
      return []
    }

    const frameRect = readFrameRect(input.graph(), record.item.id)
    return frameRect && geometryApi.rect.contains(frameRect, rect)
      ? [record.item.id]
      : []
  }),
  pick: (point, options) => nodeApi.frame.pick({
    candidates: readFrameCandidates({
      graph: input.graph(),
      records: input.spatial.point(point, {
        kinds: ['node']
      })
    }),
    point,
    excludeIds: options?.excludeIds?.length
      ? new Set(options.excludeIds)
      : undefined
  }),
  parent: (nodeId, options) => {
    const rect = input.graph().nodes.get(nodeId)?.geometry.rect
    if (!rect) {
      return undefined
    }

    return nodeApi.frame.pickParent({
      candidates: readFrameCandidates({
        graph: input.graph(),
        records: input.spatial.rect(rect, {
          kinds: ['node']
        })
      }),
      rect,
      nodeId,
      excludeIds: options?.excludeIds?.length
        ? new Set(options.excludeIds)
        : undefined
    })
  },
  descendants: (nodeIds) => readTreeDescendants(input.indexes(), nodeIds)
})

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
