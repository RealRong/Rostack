import type {
  CanvasItemRef,
  Rect
} from '@whiteboard/core/types'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  SceneItem,
  SceneSnapshot
} from '../contracts/editor'
import type {
  SceneWorkingState,
  StructureWorkingState,
  WorkingState
} from '../contracts/working'
import { EMPTY_SCENE_LAYERS } from './geometry'

const toSceneItem = (
  ref: CanvasItemRef
): SceneItem => ({
  kind: ref.kind,
  id: ref.id
}) as SceneItem

const readSceneItemBounds = (input: {
  item: SceneItem
  structure: StructureWorkingState
  element: WorkingState['element']
  working: Pick<WorkingState, 'tree'>
}): Rect | undefined => {
  switch (input.item.kind) {
    case 'node':
      return input.element.nodes.get(input.item.id)?.layout.bounds
    case 'edge':
      return input.element.edges.get(input.item.id)?.route.bounds
    case 'mindmap':
      return input.working.tree.mindmaps.get(input.item.id)?.layout?.bbox
  }
}

const isVisibleInWorld = (
  rect: Rect | undefined,
  visibleWorld: Rect | undefined
) => !visibleWorld
  || !rect
  || geometryApi.rect.intersects(rect, visibleWorld)

export const buildSceneWorkingState = (input: {
  snapshot: WorkingState['input']['document']['snapshot']
  structure: StructureWorkingState
  element: WorkingState['element']
  working: Pick<WorkingState, 'tree'>
  visibleWorld?: Rect
}): SceneWorkingState => {
  const items = input.snapshot.state.root.canvas.order.map(toSceneItem)
  const visibleItems = items.filter((item) => isVisibleInWorld(
    readSceneItemBounds({
      item,
      structure: input.structure,
      element: input.element,
      working: input.working
    }),
    input.visibleWorld
  ))

  return {
    layers: EMPTY_SCENE_LAYERS,
    items,
    visible: {
      items: visibleItems,
      nodeIds: [...input.element.nodes.entries()]
        .filter(([, node]) => (
          !node.render.hidden
          && isVisibleInWorld(node.layout.bounds, input.visibleWorld)
        ))
        .map(([nodeId]) => nodeId),
      edgeIds: [...input.element.edges.entries()]
        .filter(([, edge]) => isVisibleInWorld(edge.route.bounds, input.visibleWorld))
        .map(([edgeId]) => edgeId),
      mindmapIds: [...input.structure.mindmaps.keys()]
        .filter((mindmapId) => isVisibleInWorld(
          input.working.tree.mindmaps.get(mindmapId)?.layout?.bbox,
          input.visibleWorld
        ))
    }
  }
}

export const buildSceneSnapshot = (
  working: WorkingState
): SceneSnapshot => ({
  layers: working.scene.layers,
  items: working.scene.items,
  visible: working.scene.visible,
  spatial: {
    nodes: working.scene.visible.nodeIds,
    edges: working.scene.visible.edgeIds,
    mindmaps: working.scene.visible.mindmapIds
  },
  pick: {
    items: working.scene.visible.items.map((item) => ({
      kind: item.kind,
      id: item.id
    })) as readonly CanvasItemRef[]
  }
})
