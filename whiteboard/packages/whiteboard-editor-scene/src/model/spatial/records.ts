import type {
  Document,
} from '@whiteboard/core/types'
import type { Revision } from '@shared/projection'
import type { GraphState } from '../../contracts/working'
import type {
  SpatialItemRef,
  SpatialKey,
  SpatialRecord
} from './contracts'
import {
  spatialKey
} from './contracts'
import type { SpatialIndexState } from './state'

export const toSpatialKey = (
  input: SpatialItemRef
): SpatialKey => spatialKey.write(input)

export type SceneOrderRead = (item: SpatialItemRef) => number

type DocumentSnapshot = {
  revision: Revision
  document: Document
}

export const syncSceneOrderState = (
  state: Pick<SpatialIndexState, 'orderByKey'>,
  snapshot: DocumentSnapshot
) => {
  state.orderByKey.clear()
  snapshot.document.order.forEach((item, index) => {
    state.orderByKey.set(toSpatialKey(item), index)
  })
}

export const createSceneOrderRead = (
  state: Pick<SpatialIndexState, 'orderByKey'>
): SceneOrderRead => (
  item
) => state.orderByKey.get(toSpatialKey(item)) ?? Number.MAX_SAFE_INTEGER

export const readNodeSpatialRecord = (input: {
  graph: GraphState
  readOrder: SceneOrderRead
  nodeId: string
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
    order: input.readOrder(item)
  }
}

export const readEdgeSpatialRecord = (input: {
  graph: GraphState
  readOrder: SceneOrderRead
  edgeId: string
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
    order: input.readOrder(item)
  }
}

export const readMindmapSpatialRecord = (input: {
  graph: GraphState
  readOrder: SceneOrderRead
  mindmapId: string
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
    order: input.readOrder(item)
  }
}
