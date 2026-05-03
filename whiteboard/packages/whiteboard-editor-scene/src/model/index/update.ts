import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  Document,
  Edge,
  EdgeId,
  GroupId,
  MindmapId,
  Node,
  NodeId
} from '@whiteboard/core/types'
import type {
  EdgeNodes,
  GroupItemRef,
  OwnerRef
} from '../../contracts/editor'
import type { IndexState } from '../../contracts/working'
import { readGroupSignatureFromItems } from '../graph/group'
import {
  readMindmapNodeIds
} from '../graph/mindmap'

const clearEdgeAdjacency = (
  state: IndexState
) => {
  state.edgeNodesByEdge.clear()
  state.edgeIdsByNode.clear()
}

const addEdgeAdjacency = (
  state: IndexState,
  edgeId: EdgeId,
  nodeId: NodeId
) => {
  const current = state.edgeIdsByNode.get(nodeId)
  if (current) {
    current.add(edgeId)
    return
  }

  state.edgeIdsByNode.set(nodeId, new Set([edgeId]))
}

const removeEdgeAdjacency = (
  state: IndexState,
  edgeId: EdgeId,
  nodeId: NodeId
) => {
  const current = state.edgeIdsByNode.get(nodeId)
  if (!current) {
    return
  }

  current.delete(edgeId)
  if (current.size === 0) {
    state.edgeIdsByNode.delete(nodeId)
  }
}

const readNodeOwner = (
  node: Node | undefined
): OwnerRef | undefined => {
  if (!node) {
    return undefined
  }

  if (node.owner?.kind === 'mindmap') {
    return {
      kind: 'mindmap',
      id: node.owner.id
    }
  }

  if (node.groupId) {
    return {
      kind: 'group',
      id: node.groupId
    }
  }

  return undefined
}

const readEdgeNodes = (
  edge: Edge | undefined
): EdgeNodes => edge
  ? {
      ...(edge.source.kind === 'node'
        ? {
            source: edge.source.nodeId
          }
        : {}),
      ...(edge.target.kind === 'node'
        ? {
            target: edge.target.nodeId
          }
        : {})
    }
  : {}

const removeSignatureEntry = (
  state: IndexState,
  groupId: GroupId,
  signature: string | undefined
) => {
  if (!signature) {
    return
  }

  const current = state.groupIdsBySignature.get(signature)
  if (!current) {
    return
  }

  const next = current.filter((id) => id !== groupId)
  if (next.length === 0) {
    state.groupIdsBySignature.delete(signature)
    return
  }

  state.groupIdsBySignature.set(signature, next)
}

const addSignatureEntry = (
  state: IndexState,
  groupId: GroupId,
  signature: string
) => {
  const current = state.groupIdsBySignature.get(signature)
  if (!current) {
    state.groupIdsBySignature.set(signature, [groupId])
    return
  }

  if (current.includes(groupId)) {
    return
  }

  state.groupIdsBySignature.set(signature, [...current, groupId])
}

const rebuildGroupItems = (
  document: Document,
  groupIds: ReadonlySet<GroupId>
): ReadonlyMap<GroupId, readonly GroupItemRef[]> => {
  const items = new Map<GroupId, GroupItemRef[]>()

  groupIds.forEach((groupId) => {
    if (document.groups[groupId]) {
      items.set(groupId, [])
    }
  })

  if (items.size === 0) {
    return items
  }

  document.order.forEach((ref) => {
    if (ref.kind === 'mindmap') {
      return
    }

    const groupId = ref.kind === 'node'
      ? document.nodes[ref.id]?.groupId
      : document.edges[ref.id]?.groupId

    if (!groupId) {
      return
    }

    items.get(groupId)?.push(ref)
  })

  return items
}

const setGroupItems = (
  state: IndexState,
  groupId: GroupId,
  items: readonly GroupItemRef[] | undefined
) => {
  const previousSignature = state.groupSignature.get(groupId)
  removeSignatureEntry(state, groupId, previousSignature)

  if (!items) {
    state.groupItems.delete(groupId)
    state.groupSignature.delete(groupId)
    return
  }

  state.groupItems.set(groupId, items)
  const signature = readGroupSignatureFromItems(items)
  state.groupSignature.set(groupId, signature)
  addSignatureEntry(state, groupId, signature)
}

const collectMindmapNodes = (
  document: Document | undefined,
  mindmapIds: ReadonlySet<MindmapId>
): ReadonlySet<NodeId> => {
  const nodeIds = new Set<NodeId>()

  if (!document) {
    return nodeIds
  }

  mindmapIds.forEach((mindmapId) => {
    readMindmapNodeIds(document.mindmaps[mindmapId]).forEach((nodeId) => {
      nodeIds.add(nodeId)
    })
  })

  return nodeIds
}

const clearMindmapEntries = (
  state: IndexState,
  record: Document['mindmaps'][string] | undefined
) => {
  if (!record) {
    return
  }

  const tree = mindmapApi.tree.fromRecord(record)
  readMindmapNodeIds(record).forEach((nodeId) => {
    state.parentByNode.delete(nodeId)
    state.childrenByNode.delete(nodeId)
  })
  state.childrenByNode.delete(tree.rootNodeId)
}

const patchMindmapEntries = (
  state: IndexState,
  mindmapId: MindmapId,
  record: Document['mindmaps'][MindmapId] | undefined
) => {
  if (!record) {
    state.mindmapNodes.delete(mindmapId)
    return
  }

  const nodeIds = readMindmapNodeIds(record)
  state.mindmapNodes.set(mindmapId, nodeIds)

  nodeIds.forEach((nodeId) => {
    const node = record.tree.nodes[nodeId]
    state.parentByNode.set(nodeId, node?.parentId)
    state.childrenByNode.set(nodeId, [...(node?.children ?? [])])
  })
}

export const clearIndexState = (
  state: IndexState
) => {
  state.ownerByNode.clear()
  state.mindmapNodes.clear()
  state.parentByNode.clear()
  state.childrenByNode.clear()
  clearEdgeAdjacency(state)
  state.groupItems.clear()
  state.groupSignature.clear()
  state.groupIdsBySignature.clear()
  state.groupByEdge.clear()
}

export const rebuildIndexState = (input: {
  state: IndexState
  document: Document
}) => {
  clearIndexState(input.state)

  ;(Object.entries(input.document.nodes) as readonly (readonly [NodeId, Node])[]).forEach(([nodeId, node]) => {
    input.state.ownerByNode.set(nodeId, readNodeOwner(node))
  })

  Object.entries(input.document.mindmaps).forEach(([mindmapId, record]) => {
    patchMindmapEntries(input.state, mindmapId, record)
  })

  ;(Object.entries(input.document.edges) as readonly (readonly [EdgeId, Edge])[]).forEach(([edgeId, edge]) => {
    const nodes = readEdgeNodes(edge)
    input.state.edgeNodesByEdge.set(edgeId, nodes)
    if (nodes.source) {
      addEdgeAdjacency(input.state, edgeId, nodes.source)
    }
    if (nodes.target) {
      addEdgeAdjacency(input.state, edgeId, nodes.target)
    }
    input.state.groupByEdge.set(edgeId, edge.groupId)
  })

  const groupIds = new Set(Object.keys(input.document.groups) as GroupId[])
  const groupItems = rebuildGroupItems(input.document, groupIds)
  groupIds.forEach((groupId) => {
    setGroupItems(input.state, groupId, groupItems.get(groupId))
  })
}

export const patchIndexState = (input: {
  state: IndexState
  previous: Document | undefined
  next: Document
  scope: {
    reset: boolean
    order: boolean
    nodes: ReadonlySet<NodeId>
    edges: ReadonlySet<EdgeId>
    mindmaps: ReadonlySet<MindmapId>
    groups: ReadonlySet<GroupId>
  }
}) => {
  if (!input.previous || input.scope.reset) {
    rebuildIndexState({
      state: input.state,
      document: input.next
    })
    return
  }

  const previous = input.previous
  const touchedMindmaps = input.scope.mindmaps
  const touchedNodes = new Set<NodeId>([
    ...input.scope.nodes,
    ...collectMindmapNodes(previous, touchedMindmaps),
    ...collectMindmapNodes(input.next, touchedMindmaps)
  ])
  const touchedEdges = input.scope.edges

  touchedNodes.forEach((nodeId) => {
    const nextNode = input.next.nodes[nodeId]
    if (!nextNode) {
      input.state.ownerByNode.delete(nodeId)
      return
    }

    input.state.ownerByNode.set(nodeId, readNodeOwner(nextNode))
  })

  touchedMindmaps.forEach((mindmapId) => {
    clearMindmapEntries(input.state, previous.mindmaps[mindmapId])
    patchMindmapEntries(input.state, mindmapId, input.next.mindmaps[mindmapId])
  })

  touchedEdges.forEach((edgeId) => {
    const previousNodes = input.state.edgeNodesByEdge.get(edgeId) ?? {}
    if (previousNodes.source) {
      removeEdgeAdjacency(input.state, edgeId, previousNodes.source)
    }
    if (previousNodes.target) {
      removeEdgeAdjacency(input.state, edgeId, previousNodes.target)
    }

    const nextEdge = input.next.edges[edgeId]
    if (!nextEdge) {
      input.state.edgeNodesByEdge.delete(edgeId)
      input.state.groupByEdge.delete(edgeId)
      return
    }

    const nextNodes = readEdgeNodes(nextEdge)
    input.state.edgeNodesByEdge.set(edgeId, nextNodes)
    if (nextNodes.source) {
      addEdgeAdjacency(input.state, edgeId, nextNodes.source)
    }
    if (nextNodes.target) {
      addEdgeAdjacency(input.state, edgeId, nextNodes.target)
    }
    input.state.groupByEdge.set(edgeId, nextEdge.groupId)
  })

  const affectedGroupIds = new Set<GroupId>([
    ...input.scope.groups
  ])
  input.scope.nodes.forEach((nodeId) => {
    const previousGroupId = previous.nodes[nodeId]?.groupId
    const nextGroupId = input.next.nodes[nodeId]?.groupId
    if (previousGroupId) {
      affectedGroupIds.add(previousGroupId)
    }
    if (nextGroupId) {
      affectedGroupIds.add(nextGroupId)
    }
  })
  input.scope.edges.forEach((edgeId) => {
    const previousGroupId = previous.edges[edgeId]?.groupId
    const nextGroupId = input.next.edges[edgeId]?.groupId
    if (previousGroupId) {
      affectedGroupIds.add(previousGroupId)
    }
    if (nextGroupId) {
      affectedGroupIds.add(nextGroupId)
    }
  })

  if (input.scope.order) {
    Object.keys(previous.groups).forEach((groupId) => {
      affectedGroupIds.add(groupId as GroupId)
    })
    Object.keys(input.next.groups).forEach((groupId) => {
      affectedGroupIds.add(groupId as GroupId)
    })
  }

  const nextGroupItems = rebuildGroupItems(input.next, affectedGroupIds)
  affectedGroupIds.forEach((groupId) => {
    setGroupItems(
      input.state,
      groupId,
      input.next.groups[groupId]
        ? nextGroupItems.get(groupId)
        : undefined
    )
  })
}
