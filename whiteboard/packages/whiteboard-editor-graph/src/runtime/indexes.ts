import { mindmap as mindmapApi, type MindmapTree } from '@whiteboard/core/mindmap'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  Document,
  Edge,
  EdgeId,
  GroupId,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId
} from '@whiteboard/core/types'
import type {
  EdgeNodes,
  EngineDelta,
  GroupItemRef,
  OwnerRef
} from '../contracts/editor'
import type { IndexState } from '../contracts/working'

const SIGNATURE_SEPARATOR = '\u0001'
const SIGNATURE_SECTION = '\u0002'

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

export const readNodeOwner = (
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

export const readEdgeNodes = (
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

export const readMindmapNodeIds = (
  record: MindmapRecord | undefined
): readonly NodeId[] => record
  ? Object.keys(record.members) as readonly NodeId[]
  : []

export const readMindmapTree = (
  record: MindmapRecord | undefined
): MindmapTree | undefined => record
  ? mindmapApi.tree.fromRecord(record)
  : undefined

export const readGroupSignatureFromTarget = (
  target: SelectionTarget
): string => [
  target.nodeIds.join(SIGNATURE_SEPARATOR),
  target.edgeIds.join(SIGNATURE_SEPARATOR)
].join(SIGNATURE_SECTION)

export const readGroupSignatureFromItems = (
  items: readonly GroupItemRef[]
): string => {
  const nodeIds: string[] = []
  const edgeIds: string[] = []

  items.forEach((item) => {
    if (item.kind === 'node') {
      nodeIds.push(item.id)
      return
    }

    edgeIds.push(item.id)
  })

  return readGroupSignatureFromTarget(
    selectionApi.target.normalize({
      nodeIds,
      edgeIds
    })
  )
}

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

  document.canvas.order.forEach((ref) => {
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

const collectTouchedIds = <TId extends string>(
  delta: {
    added: ReadonlySet<TId>
    updated: ReadonlySet<TId>
    removed: ReadonlySet<TId>
  }
): ReadonlySet<TId> => new Set<TId>([
  ...delta.added,
  ...delta.updated,
  ...delta.removed
])

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
  record: MindmapRecord | undefined
) => {
  if (!record) {
    return
  }

  const tree = mindmapApi.tree.fromRecord(record)
  readMindmapNodeIds(record).forEach((nodeId) => {
    state.parentByNode.delete(nodeId)
    state.childrenByNode.delete(nodeId)
  })
  Object.keys(record.children).forEach((nodeId) => {
    state.childrenByNode.delete(nodeId as NodeId)
  })
  state.childrenByNode.delete(tree.rootNodeId)
}

const patchMindmapEntries = (
  state: IndexState,
  mindmapId: MindmapId,
  record: MindmapRecord | undefined
) => {
  if (!record) {
    state.mindmapNodes.delete(mindmapId)
    return
  }

  const nodeIds = readMindmapNodeIds(record)
  state.mindmapNodes.set(mindmapId, nodeIds)

  nodeIds.forEach((nodeId) => {
    state.parentByNode.set(nodeId, record.members[nodeId]?.parentId)
    state.childrenByNode.set(nodeId, [...(record.children[nodeId] ?? [])])
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

  ;(Object.entries(input.document.mindmaps) as readonly (readonly [MindmapId, MindmapRecord])[]).forEach(([mindmapId, record]) => {
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
    setGroupItems(input.state, groupId, groupItems.get(groupId) ?? [])
  })
}

export const patchIndexState = (input: {
  state: IndexState
  previous: Document | undefined
  next: Document
  delta: EngineDelta
}) => {
  if (!input.previous || input.delta.reset) {
    rebuildIndexState({
      state: input.state,
      document: input.next
    })
    return
  }

  const previous = input.previous
  const touchedMindmaps = collectTouchedIds(input.delta.mindmaps)
  const touchedNodes = new Set<NodeId>([
    ...collectTouchedIds(input.delta.nodes),
    ...collectMindmapNodes(previous, touchedMindmaps),
    ...collectMindmapNodes(input.next, touchedMindmaps)
  ])
  const touchedEdges = collectTouchedIds(input.delta.edges)

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
    ...collectTouchedIds(input.delta.groups)
  ])
  collectTouchedIds(input.delta.nodes).forEach((nodeId) => {
    const previousGroupId = previous.nodes[nodeId]?.groupId
    const nextGroupId = input.next.nodes[nodeId]?.groupId
    if (previousGroupId) {
      affectedGroupIds.add(previousGroupId)
    }
    if (nextGroupId) {
      affectedGroupIds.add(nextGroupId)
    }
  })
  collectTouchedIds(input.delta.edges).forEach((edgeId) => {
    const previousGroupId = previous.edges[edgeId]?.groupId
    const nextGroupId = input.next.edges[edgeId]?.groupId
    if (previousGroupId) {
      affectedGroupIds.add(previousGroupId)
    }
    if (nextGroupId) {
      affectedGroupIds.add(nextGroupId)
    }
  })

  if (input.delta.order) {
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
        ? (nextGroupItems.get(groupId) ?? [])
        : undefined
    )
  })
}

export const readRelatedEdgeIds = (
  state: Pick<IndexState, 'edgeIdsByNode'>,
  nodeIds: Iterable<NodeId>
): readonly EdgeId[] => {
  const related = new Set<EdgeId>()
  for (const nodeId of nodeIds) {
    state.edgeIdsByNode.get(nodeId)?.forEach((edgeId) => {
      related.add(edgeId)
    })
  }
  return [...related]
}

export const readMindmapId = (input: {
  document: Document
  indexes: Pick<IndexState, 'ownerByNode'>
  value: string
}): MindmapId | undefined => {
  if (input.document.mindmaps[input.value]) {
    return input.value as MindmapId
  }

  const owner = input.indexes.ownerByNode.get(input.value as NodeId)
  return owner?.kind === 'mindmap'
    ? owner.id
    : undefined
}

export const readMindmapStructure = (input: {
  document: Document
  indexes: Pick<IndexState, 'mindmapNodes'>
  value: MindmapId | NodeId
}): {
  id: MindmapId
  rootId: NodeId
  nodeIds: readonly NodeId[]
  tree: MindmapTree
} | undefined => {
  const record = input.document.mindmaps[input.value as MindmapId]
  if (record) {
    return {
      id: input.value as MindmapId,
      rootId: record.root,
      nodeIds: input.indexes.mindmapNodes.get(input.value as MindmapId) ?? [],
      tree: mindmapApi.tree.fromRecord(record)
    }
  }

  for (const [mindmapId, mindmap] of Object.entries(input.document.mindmaps) as readonly (readonly [MindmapId, MindmapRecord])[]) {
    if (mindmap.members[input.value as NodeId]) {
      return {
        id: mindmapId,
        rootId: mindmap.root,
        nodeIds: input.indexes.mindmapNodes.get(mindmapId) ?? [],
        tree: mindmapApi.tree.fromRecord(mindmap)
      }
    }
  }

  return undefined
}

export const readTreeDescendants = (
  state: Pick<IndexState, 'childrenByNode'>,
  rootIds: readonly NodeId[]
): readonly NodeId[] => {
  const result: NodeId[] = []
  const visited = new Set<NodeId>()
  const stack = [...rootIds].reverse()

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) {
      continue
    }

    const children = state.childrenByNode.get(current) ?? []
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index]!
      if (visited.has(childId)) {
        continue
      }

      visited.add(childId)
      result.push(childId)
      stack.push(childId)
    }
  }

  return result
}

export const readGroupTarget = (
  items: readonly GroupItemRef[]
): SelectionTarget => selectionApi.target.normalize({
  nodeIds: items
    .filter((item): item is Extract<GroupItemRef, { kind: 'node' }> => item.kind === 'node')
    .map((item) => item.id),
  edgeIds: items
    .filter((item): item is Extract<GroupItemRef, { kind: 'edge' }> => item.kind === 'edge')
    .map((item) => item.id)
})
