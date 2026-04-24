import type {
  CanvasItemRef,
  Rect
} from '@whiteboard/core/types'
import type * as document from '@whiteboard/engine/contracts/document'
import type {
  SceneItem,
  SceneSnapshot
} from '../contracts/editor'
import { EMPTY_SCENE_LAYERS } from './geometry'
import type {
  SpatialKey,
} from './spatial/contracts'
import {
  queryAll,
  queryRect
} from './spatial/query'
import type { SpatialIndexState } from './spatial/state'

const toSceneItem = (
  ref: CanvasItemRef
): SceneItem => ({
  kind: ref.kind,
  id: ref.id
}) as SceneItem

const toVisibleItemKey = (
  item: SceneItem
): SpatialKey => `${item.kind}:${item.id}` as SpatialKey

const toCanvasItemRef = (
  item: SceneItem
): CanvasItemRef => ({
  kind: item.kind,
  id: item.id
})

const readVisibleRecords = (input: {
  spatial: SpatialIndexState
  visibleWorld?: Rect
}) => {
  if (input.visibleWorld) {
    return queryRect({
      state: input.spatial,
      worldRect: input.visibleWorld
    })
  }

  return queryAll({
    state: input.spatial
  })
}

export const buildSceneSnapshot = (input: {
  snapshot: document.Snapshot
  spatial: SpatialIndexState
  visibleWorld?: Rect
}): SceneSnapshot => {
  const items = input.snapshot.state.root.canvas.order.map(toSceneItem)
  const visibleRecords = readVisibleRecords({
    spatial: input.spatial,
    visibleWorld: input.visibleWorld
  })
  const visibleKeys = new Set(visibleRecords.map((record) => record.key))
  const visibleItems = items.filter((item) => visibleKeys.has(
    toVisibleItemKey(item)
  ))
  const visibleNodeIds = visibleRecords.flatMap((record) => (
    record.kind === 'node'
      ? [record.item.id]
      : []
  ))
  const visibleEdgeIds = visibleRecords.flatMap((record) => (
    record.kind === 'edge'
      ? [record.item.id]
      : []
  ))
  const visibleMindmapIds = visibleRecords.flatMap((record) => (
    record.kind === 'mindmap'
      ? [record.item.id]
      : []
  ))

  return {
    layers: EMPTY_SCENE_LAYERS,
    items,
    visible: {
      items: visibleItems,
      nodeIds: visibleNodeIds,
      edgeIds: visibleEdgeIds,
      mindmapIds: visibleMindmapIds
    },
    spatial: {
      nodes: visibleNodeIds,
      edges: visibleEdgeIds,
      mindmaps: visibleMindmapIds
    },
    pick: {
      items: visibleItems.map(toCanvasItemRef)
    }
  }
}
