import type { MindmapStructure } from '@whiteboard/core/mindmap'
import type {
  SelectionAffordance,
  SelectionSummary,
  SelectionTarget
} from '@whiteboard/core/selection'
import type { Edge, EdgeId, MindmapId, NodeId, NodeModel } from '@whiteboard/core/types'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type {
  SelectionEdgeStats,
  SelectionMembers,
  SelectionNodeStats,
  SelectionToolbarContext,
  SelectionToolbarEdgeScope,
  SelectionToolbarLockState,
  SelectionToolbarNodeScope,
  SelectionToolbarScope
} from '@whiteboard/editor/types/selectionPresentation'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import { readEdgeScope } from './selection-policy-edge'
import { readNodeScope } from './selection-policy-node'

const readNodeCountLabel = (
  count: number
) => count === 1 ? '1 node' : `${count} nodes`

const readEdgeCountLabel = (
  count: number
) => count === 1 ? '1 edge' : `${count} edges`

const createSelectionTarget = ({
  nodeIds = [],
  edgeIds = []
}: {
  nodeIds?: readonly NodeId[]
  edgeIds?: readonly EdgeId[]
}): SelectionTarget => ({
  nodeIds,
  edgeIds
})

const readSelectionToolbarLockState = (
  nodeStats: SelectionNodeStats,
  edgeCount: number
): SelectionToolbarLockState => {
  if (nodeStats.count === 0 && edgeCount === 0) {
    return 'none'
  }

  if (nodeStats.count === 0) {
    return 'none'
  }

  return nodeStats.lock
}

const collectNodesByIds = (
  nodeById: ReadonlyMap<NodeId, NodeModel>,
  ids: readonly NodeId[]
): NodeModel[] => ids.flatMap((id) => {
  const node = nodeById.get(id)
  return node ? [node] : []
})

const collectEdgesByIds = (
  edgeById: ReadonlyMap<EdgeId, Edge>,
  ids: readonly EdgeId[]
): Edge[] => ids.flatMap((id) => {
  const edge = edgeById.get(id)
  return edge ? [edge] : []
})

export const resolveSelectionToolbar = ({
  members,
  summary,
  affordance,
  nodeStats,
  edgeStats,
  nodeScope,
  edgeScope,
  nodeType,
  readMindmapStructure,
  tool,
  edit,
  interactionChrome,
  editingEdge,
  defaults
}: {
  members: SelectionMembers
  summary: SelectionSummary
  affordance: SelectionAffordance
  nodeStats: SelectionNodeStats
  edgeStats: SelectionEdgeStats
  nodeScope: SelectionToolbarNodeScope | undefined
  edgeScope: SelectionToolbarEdgeScope | undefined
  nodeType: Pick<NodeTypeSupport, 'hasControl' | 'supportsStyle'>
  readMindmapStructure: (id: MindmapId) => MindmapStructure | undefined
  tool: Tool
  edit: EditSession
  interactionChrome: boolean
  editingEdge: boolean
  defaults: EditorDefaults['selection']
}): SelectionToolbarContext | undefined => {
  const box = affordance.displayBox
  if (!box) {
    return undefined
  }

  if (
    summary.items.count === 0
    || tool.type !== 'select'
    || !interactionChrome
    || edit?.kind === 'edge-label'
    || editingEdge
  ) {
    return undefined
  }

  const scopes: SelectionToolbarScope[] = []
  const nodeById = new Map<NodeId, NodeModel>()
  members.nodes.forEach((node) => {
    nodeById.set(node.id, node)
  })
  const edgeById = new Map<EdgeId, Edge>()
  members.edges.forEach((edge) => {
    edgeById.set(edge.id, edge)
  })

  if (nodeStats.count > 0 && nodeScope) {
    scopes.push({
      key: 'nodes',
      kind: 'nodes',
      label: readNodeCountLabel(nodeStats.count),
      count: nodeStats.count,
      target: createSelectionTarget({
        nodeIds: nodeStats.ids
      }),
      icon:
        nodeStats.types.length === 1
          ? nodeStats.types[0]?.icon
          : 'shape',
      node: nodeScope
    })

    if (nodeStats.types.length > 1) {
      nodeStats.types.forEach((type) => {
        const scopedNodes = collectNodesByIds(nodeById, type.nodeIds)

        scopes.push({
          key: `node-type:${type.key}`,
          kind: 'node-type',
          label: `${type.name} (${type.count})`,
          count: type.count,
          target: createSelectionTarget({
            nodeIds: type.nodeIds
          }),
          icon: type.icon,
          node: readNodeScope({
            nodes: scopedNodes,
            nodeIds: type.nodeIds,
            primaryNode: scopedNodes[0],
            nodeType,
            nodeStats: {
              ids: type.nodeIds,
              count: type.count,
              hasGroup: scopedNodes.some((node) => Boolean(node.groupId)),
              lock:
                scopedNodes.length === 0
                  ? 'none'
                  : scopedNodes.every((node) => node.locked)
                    ? 'all'
                    : scopedNodes.some((node) => node.locked)
                      ? 'mixed'
                      : 'none',
              types: [type]
            },
            readMindmapStructure,
            defaults
          })
        })
      })
    }
  }

  if (edgeStats.count > 0 && edgeScope) {
    scopes.push({
      key: 'edges',
      kind: 'edges',
      label: readEdgeCountLabel(edgeStats.count),
      count: edgeStats.count,
      target: createSelectionTarget({
        edgeIds: edgeStats.ids
      }),
      edge: edgeScope
    })

    if (edgeStats.types.length > 1) {
      edgeStats.types.forEach((type) => {
        const scopedEdges = collectEdgesByIds(edgeById, type.edgeIds)

        scopes.push({
          key: `edge-type:${type.key}`,
          kind: 'edge-type',
          label: `${type.name} (${type.count})`,
          count: type.count,
          target: createSelectionTarget({
            edgeIds: type.edgeIds
          }),
          edgeType: type.edgeType,
          edge: readEdgeScope({
            edges: scopedEdges,
            edgeIds: type.edgeIds,
            primaryEdge: scopedEdges[0],
            defaults
          })
        })
      })
    }
  }

  const defaultScopeKey = nodeStats.count > 0 ? 'nodes' : 'edges'
  const selectionKind = summary.items.nodeCount > 0 && summary.items.edgeCount > 0
    ? 'mixed'
    : summary.items.nodeCount > 0
      ? 'nodes'
      : 'edges'

  return {
    box,
    key: members.key,
    selectionKind,
    target: members.target,
    nodes: members.nodes,
    edges: members.edges,
    scopes,
    defaultScopeKey,
    locked: readSelectionToolbarLockState(nodeStats, edgeStats.count)
  }
}
