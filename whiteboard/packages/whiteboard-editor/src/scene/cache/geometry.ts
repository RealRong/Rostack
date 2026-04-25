import type { EdgeView as CoreEdgeView } from '@whiteboard/core/edge'
import { store } from '@shared/core'
import type {
  EdgeId,
  NodeId,
  NodeModel
} from '@whiteboard/core/types'
import type {
  EdgeView as RuntimeEdgeView,
  NodeView as RuntimeNodeView
} from '@whiteboard/editor-scene'
import {
  resolveGraphEdgeGeometry
} from '@whiteboard/editor/scene/edge'
import type { GraphNodeGeometry } from '@whiteboard/editor/scene/node'

export type SceneNodeGeometry = GraphNodeGeometry & {
  node: NodeModel
}

export type SceneGeometry = {
  node: (nodeId: NodeId) => SceneNodeGeometry | undefined
  edge: (edgeId: EdgeId) => CoreEdgeView | undefined
}

export const createSceneGeometry = (input: {
  revision: () => number
  nodeGraph: store.KeyedReadStore<NodeId, RuntimeNodeView | undefined>
  edgeGraph: store.KeyedReadStore<EdgeId, RuntimeEdgeView | undefined>
}): SceneGeometry => {
  const state = {
    revision: -1,
    node: new Map<NodeId, SceneNodeGeometry | null>(),
    edge: new Map<EdgeId, CoreEdgeView | null>()
  }

  const sync = () => {
    const currentRevision = input.revision()
    if (state.revision === currentRevision) {
      return
    }

    state.revision = currentRevision
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

    const current = store.read(input.nodeGraph, nodeId)
    const next = current
      ? {
          ...current.geometry.outline,
          rotation: current.geometry.rotation,
          node: current.base.node
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
      ? resolveGraphEdgeGeometry({
          edge,
          readNodeGeometry
        }) ?? null
      : null

    state.edge.set(edgeId, next)
    return next ?? undefined
  }

  return {
    node: readNodeGeometry,
    edge: readEdgeGeometry
  }
}
