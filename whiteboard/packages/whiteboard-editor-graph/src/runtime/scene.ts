import type {
  CanvasItemRef,
  Rect
} from '@whiteboard/core/types'
import type * as document from '@whiteboard/engine/contracts/document'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  SceneItem,
  SceneSnapshot
} from '../contracts/editor'
import type { GraphState } from '../contracts/working'
import { EMPTY_SCENE_LAYERS } from './geometry'

const toSceneItem = (
  ref: CanvasItemRef
): SceneItem => ({
  kind: ref.kind,
  id: ref.id
}) as SceneItem

const readSceneItemBounds = (input: {
  item: SceneItem
  graph: GraphState
}): Rect | undefined => {
  switch (input.item.kind) {
    case 'node':
      return input.graph.nodes.get(input.item.id)?.layout.bounds
    case 'edge':
      return input.graph.edges.get(input.item.id)?.route.bounds
    case 'mindmap':
      return input.graph.owners.mindmaps.get(input.item.id)?.tree.bbox
  }
}

const isVisibleInWorld = (
  rect: Rect | undefined,
  visibleWorld: Rect | undefined
) => !visibleWorld
  || !rect
  || geometryApi.rect.intersects(rect, visibleWorld)

export const buildSceneSnapshot = (input: {
  snapshot: document.Snapshot
  graph: GraphState
  visibleWorld?: Rect
}): SceneSnapshot => {
  const items = input.snapshot.state.root.canvas.order.map(toSceneItem)
  const visibleItems = items.filter((item) => isVisibleInWorld(
    readSceneItemBounds({
      item,
      graph: input.graph
    }),
    input.visibleWorld
  ))
  const visibleNodeIds = [...input.graph.nodes.entries()]
    .filter(([, node]) => (
      !node.render.hidden
      && isVisibleInWorld(node.layout.bounds, input.visibleWorld)
    ))
    .map(([nodeId]) => nodeId)
  const visibleEdgeIds = [...input.graph.edges.entries()]
    .filter(([, edge]) => isVisibleInWorld(edge.route.bounds, input.visibleWorld))
    .map(([edgeId]) => edgeId)
  const visibleMindmapIds = [...input.graph.owners.mindmaps.keys()]
    .filter((mindmapId) => isVisibleInWorld(
      input.graph.owners.mindmaps.get(mindmapId)?.tree.bbox,
      input.visibleWorld
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
      items: visibleItems.map((item) => ({
        kind: item.kind,
        id: item.id
      })) as readonly CanvasItemRef[]
    }
  }
}
