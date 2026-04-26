import type { EdgeView as CoreEdgeView } from '@whiteboard/core/edge'
import { resolveEdgeViewFromNodeGeometry } from '@whiteboard/core/edge'
import { store } from '@shared/core'
import type {
  EdgeId,
  NodeId,
  NodeModel
} from '@whiteboard/core/types'
import type {
  EdgeView as RuntimeEdgeView,
  NodeRenderView,
  SceneItem
} from '@whiteboard/editor-scene'

export type SceneNodeGeometry = {
  node: NodeModel
  rect: NodeRenderView['rect']
  rotation: number
} & NodeRenderView['outline']

const readSceneItemKey = (
  item: SceneItem | {
    kind: SceneItem['kind']
    id: string
  }
) => `${item.kind}:${item.id}`

export const createSceneGeometry = (input: {
  revision: () => number
  items: store.ReadStore<readonly SceneItem[]>
  nodeView: store.KeyedReadStore<NodeId, NodeRenderView | undefined>
  edgeGraph: store.KeyedReadStore<EdgeId, RuntimeEdgeView | undefined>
}) => {
  const state = {
    revision: -1,
    order: new Map<string, number>(),
    node: new Map<NodeId, SceneNodeGeometry | null>(),
    edge: new Map<EdgeId, CoreEdgeView | null>()
  }

  const sync = () => {
    const currentRevision = input.revision()
    if (state.revision === currentRevision) {
      return
    }

    state.revision = currentRevision
    state.order = new Map(
      store.read(input.items).map((item, order) => [readSceneItemKey(item), order] as const)
    )
    state.node.clear()
    state.edge.clear()
  }

  const readNodeGeometry = (
    nodeId: NodeId
  ) => {
    sync()
    if (state.node.has(nodeId)) {
      return state.node.get(nodeId) ?? undefined
    }

    const current = store.read(input.nodeView, nodeId)
    const next = current
      ? {
          ...current.outline,
          rect: current.rect,
          rotation: current.rotation,
          node: current.node
        }
      : null

    state.node.set(nodeId, next)
    return next ?? undefined
  }

  const readEdgeGeometry = (
    edgeId: EdgeId
  ) => {
    sync()
    if (state.edge.has(edgeId)) {
      return state.edge.get(edgeId) ?? undefined
    }

    const edge = store.read(input.edgeGraph, edgeId)?.base.edge
    const next = edge
      ? resolveEdgeViewFromNodeGeometry({
          edge,
          readNodeGeometry
        }) ?? null
      : null

    state.edge.set(edgeId, next)
    return next ?? undefined
  }

  return {
    node: readNodeGeometry,
    edge: readEdgeGeometry,
    order: (
      item: SceneItem | {
        kind: SceneItem['kind']
        id: string
      }
    ) => {
      sync()
      return state.order.get(readSceneItemKey(item)) ?? -1
    }
  }
}
