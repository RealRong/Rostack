import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type { Edge, NodeId } from '@whiteboard/core/types'
import type {
  NodeCapabilityInput,
  Query,
  SelectionMembersView
} from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import { readRelatedEdgeIds } from '../../model/index/read'

const expandMoveNodeIds = (input: {
  target: SelectionTarget
  state: WorkingState
  spatial: Query['spatial']
}) => {
  const normalized = selectionApi.target.normalize(input.target)
  const expandedNodeIds = new Set(normalized.nodeIds)
  const frameQueue = normalized.nodeIds.filter((nodeId) => (
    input.state.graph.nodes.get(nodeId)?.base.node.type === 'frame'
  ))

  while (frameQueue.length > 0) {
    const frameId = frameQueue.pop()
    const frameRect = frameId
      ? input.state.graph.nodes.get(frameId)?.geometry.rect
      : undefined
    if (!frameId || !frameRect) {
      continue
    }

    input.spatial.rect(frameRect, {
      kinds: ['node']
    }).forEach((record) => {
      if (record.item.kind !== 'node' || record.item.id === frameId) {
        return
      }

      const current = input.state.graph.nodes.get(record.item.id)
      if (
        !current
        || expandedNodeIds.has(current.base.node.id)
        || !geometryApi.rect.contains(frameRect, current.geometry.rect)
      ) {
        return
      }

      expandedNodeIds.add(current.base.node.id)
      if (current.base.node.type === 'frame') {
        frameQueue.push(current.base.node.id)
      }
    })
  }

  return {
    normalized,
    expandedNodeIds
  }
}

const readSelectionMembersKey = (
  target: SelectionTarget
) => `${target.nodeIds.join('\0')}\u0001${target.edgeIds.join('\0')}`

export const createSelectionRead = (input: {
  state: () => WorkingState
  spatial: Query['spatial']
  nodeCapability?: NodeCapabilityInput
}): Query['selection'] => {
  const readMembers = (
    target: SelectionTarget
  ): SelectionMembersView => {
    const normalized = selectionApi.target.normalize(target)
    const state = input.state()
    const nodes = normalized.nodeIds.flatMap((nodeId) => {
      const current = state.graph.nodes.get(nodeId)?.base.node
      return current ? [current] : []
    })
    const edges = normalized.edgeIds.flatMap((edgeId) => {
      const current = state.graph.edges.get(edgeId)?.base.edge
      return current ? [current] : []
    })

    return {
      target: normalized,
      key: readSelectionMembersKey(normalized),
      nodes,
      edges,
      primaryNode: nodes[0],
      primaryEdge: edges[0]
    } satisfies SelectionMembersView
  }

  const readSummary = (
    target: SelectionTarget
  ) => {
    const members = readMembers(target)
    return selectionApi.derive.summary({
      target: members.target,
      nodes: members.nodes,
      edges: members.edges,
      readNodeRect: (node) => input.state().graph.nodes.get(node.id)?.geometry.rect,
      readEdgeBounds: (edge) => input.state().graph.edges.get(edge.id)?.route.bounds,
      resolveNodeTransformBehavior: (node) => {
        const capability = input.nodeCapability?.capability(node)
        return capability
          ? nodeApi.transform.resolveBehavior(node, {
              role: capability.role,
              resize: capability.resize
            })
          : undefined
      }
    })
  }

  const readAffordance = (
    target: SelectionTarget
  ) => {
    const summary = readSummary(target)
    return selectionApi.derive.affordance({
      selection: summary,
      resolveNodeRole: (node) => (
        input.nodeCapability?.capability(node).role ?? 'content'
      ),
      resolveNodeTransformCapability: (node) => {
        const capability = input.nodeCapability?.capability(node)
        return {
          resize: capability?.resize ?? false,
          rotate: capability?.rotate ?? false
        }
      }
    })
  }

  return {
    members: readMembers,
    summary: readSummary,
    affordance: readAffordance,
    selected: {
      node: (target, nodeId) => selectionApi.target.normalize(target).nodeIds.includes(nodeId),
      edge: (target, edgeId) => selectionApi.target.normalize(target).edgeIds.includes(edgeId)
    },
    move: (target) => {
      const state = input.state()
      const {
        normalized,
        expandedNodeIds
      } = expandMoveNodeIds({
        target,
        state,
        spatial: input.spatial
      })
      const relatedEdgeIds = new Set([
        ...normalized.edgeIds,
        ...readRelatedEdgeIds(state.indexes, expandedNodeIds)
      ])

      return {
        nodes: [...expandedNodeIds].flatMap((nodeId) => {
          const current = state.graph.nodes.get(nodeId)
          return current
            ? [nodeApi.patch.toSpatial({
                node: current.base.node,
                rect: current.geometry.rect,
                rotation: current.geometry.rotation
              })]
            : []
        }),
        edges: [...relatedEdgeIds].flatMap<Edge>((edgeId) => {
          const current = state.graph.edges.get(edgeId)?.base.edge
          return current ? [current] : []
        })
      }
    },
    bounds: (target) => {
      const normalized = selectionApi.target.normalize(target)
      const state = input.state()
      const nodeBounds = normalized.nodeIds.flatMap((nodeId) => {
        const current = state.graph.nodes.get(nodeId)
        return current ? [current.geometry.bounds] : []
      })
      const edgeBounds = normalized.edgeIds.flatMap((edgeId) => {
        const current = state.graph.edges.get(edgeId)?.route.bounds
        return current ? [current] : []
      })

      return geometryApi.rect.boundingRect([
        ...nodeBounds,
        ...edgeBounds
      ])
    }
  }
}
