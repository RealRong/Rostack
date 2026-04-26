import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { store } from '@shared/core'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import {
  toSpatialNode
} from '@whiteboard/core/node'
import type {
  Edge,
  EdgeId,
  Node,
  NodeId,
  Rect
} from '@whiteboard/core/types'
import type {
  NodeRenderView,
  Query as EditorGraphQuery
} from '@whiteboard/editor-scene'

const expandMoveNodeIds = (input: {
  target: SelectionTarget
  nodeView: store.KeyedReadStore<NodeId, NodeRenderView | undefined>
  spatialRect: EditorGraphQuery['spatial']['rect']
}) => {
  const normalized = selectionApi.target.normalize(input.target)
  const expandedNodeIds = new Set(normalized.nodeIds)
  const frameQueue = normalized.nodeIds.filter((nodeId) => (
    store.read(input.nodeView, nodeId)?.node.type === 'frame'
  ))

  while (frameQueue.length > 0) {
    const frameId = frameQueue.pop()
    const frameRect = frameId
      ? store.read(input.nodeView, frameId)?.rect
      : undefined
    if (!frameId || !frameRect) {
      continue
    }

    input.spatialRect(frameRect, {
      kinds: ['node']
    }).forEach((record) => {
      if (record.item.kind !== 'node' || record.item.id === frameId) {
        return
      }

      const current = store.read(input.nodeView, record.item.id)
      if (
        !current
        || expandedNodeIds.has(current.node.id)
        || !geometryApi.rect.contains(frameRect, current.rect)
      ) {
        return
      }

      expandedNodeIds.add(current.node.id)
      if (current.node.type === 'frame') {
        frameQueue.push(current.node.id)
      }
    })
  }

  return {
    normalized,
    expandedNodeIds
  }
}

export const createSceneScope = (input: {
  spatialRect: EditorGraphQuery['spatial']['rect']
  relatedEdges: (nodeIds: readonly NodeId[]) => readonly EdgeId[]
  nodeView: store.KeyedReadStore<NodeId, NodeRenderView | undefined>
  edgeBounds: (edgeId: EdgeId) => Rect | undefined
  readEdges: (edgeIds: readonly EdgeId[]) => readonly Edge[]
}) => ({
  move: (target: SelectionTarget): {
    nodes: readonly Node[]
    edges: readonly Edge[]
  } => {
    const {
      normalized,
      expandedNodeIds
    } = expandMoveNodeIds({
      target,
      nodeView: input.nodeView,
      spatialRect: input.spatialRect
    })
    const relatedEdgeIds = new Set([
      ...normalized.edgeIds,
      ...input.relatedEdges([...expandedNodeIds])
    ])

    return {
      nodes: [...expandedNodeIds].flatMap((nodeId) => {
        const current = store.read(input.nodeView, nodeId)
        return current
          ? [toSpatialNode({
              node: current.node,
              rect: current.rect,
              rotation: current.rotation
            })]
          : []
      }),
      edges: input.readEdges([...relatedEdgeIds])
    }
  },
  bounds: (target: SelectionTarget) => {
    const normalized = selectionApi.target.normalize(target)
    const nodeBounds = normalized.nodeIds.flatMap((nodeId) => {
      const current = store.read(input.nodeView, nodeId)
      return current ? [current.bounds] : []
    })
    const edgeBounds = normalized.edgeIds.flatMap((edgeId) => {
      const current = input.edgeBounds(edgeId)
      return current ? [current] : []
    })

    return geometryApi.rect.boundingRect([
      ...nodeBounds,
      ...edgeBounds
    ])
  }
})
