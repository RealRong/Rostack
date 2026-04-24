import type * as document from '@whiteboard/engine/contracts/document'
import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { GraphState } from '../../contracts/working'
import type {
  SpatialItemRef,
  SpatialKey,
  SpatialRecord
} from './contracts'

export const toSpatialKey = (
  input: SpatialItemRef
): SpatialKey => `${input.kind}:${input.id}` as SpatialKey

export const readSceneOrder = (
  snapshot: document.Snapshot,
  item: SpatialItemRef
): number => {
  const index = snapshot.state.root.canvas.order.findIndex((entry) => (
    entry.kind === item.kind && entry.id === item.id
  ))

  return index >= 0
    ? index
    : Number.MAX_SAFE_INTEGER
}

export const readNodeSpatialRecord = (input: {
  graph: GraphState
  snapshot: document.Snapshot
  nodeId: NodeId
}): SpatialRecord | undefined => {
  const node = input.graph.nodes.get(input.nodeId)
  const bounds = node?.geometry.bounds
  if (!node || !bounds) {
    return undefined
  }

  const item: SpatialItemRef = {
    kind: 'node',
    id: input.nodeId
  }

  return {
    key: toSpatialKey(item),
    kind: item.kind,
    item,
    bounds,
    order: readSceneOrder(input.snapshot, item)
  }
}

export const readEdgeSpatialRecord = (input: {
  graph: GraphState
  snapshot: document.Snapshot
  edgeId: EdgeId
}): SpatialRecord | undefined => {
  const edge = input.graph.edges.get(input.edgeId)
  const bounds = edge?.route.bounds
  if (!edge || !bounds) {
    return undefined
  }

  const item: SpatialItemRef = {
    kind: 'edge',
    id: input.edgeId
  }

  return {
    key: toSpatialKey(item),
    kind: item.kind,
    item,
    bounds,
    order: readSceneOrder(input.snapshot, item)
  }
}

export const readMindmapSpatialRecord = (input: {
  graph: GraphState
  snapshot: document.Snapshot
  mindmapId: MindmapId
}): SpatialRecord | undefined => {
  const mindmap = input.graph.owners.mindmaps.get(input.mindmapId)
  const bounds = mindmap?.tree.bbox
  if (!mindmap || !bounds) {
    return undefined
  }

  const item: SpatialItemRef = {
    kind: 'mindmap',
    id: input.mindmapId
  }

  return {
    key: toSpatialKey(item),
    kind: item.kind,
    item,
    bounds,
    order: readSceneOrder(input.snapshot, item)
  }
}
