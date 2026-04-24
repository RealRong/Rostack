import { changeSet } from '@shared/core'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import { createOverlayTable, type OverlayTable } from '@whiteboard/core/kernel/overlay'
import type { HistoryKey } from '@whiteboard/core/spec/history'
import type {
  CanvasItemRef,
  ChangeSet,
  Document,
  Edge,
  EdgeId,
  Group,
  GroupId,
  Invalidation,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId
} from '@whiteboard/core/types'

export type DraftDocument = {
  base: Document
  background: Document['background']
  canvasOrder: readonly CanvasItemRef[]
  nodes: OverlayTable<NodeId, Node>
  edges: OverlayTable<EdgeId, Edge>
  groups: OverlayTable<GroupId, Group>
  mindmaps: OverlayTable<MindmapId, MindmapRecord>
}

export type ReconcileTask = {
  type: 'mindmap.layout'
  id: MindmapId
}

export type ReduceRuntime = {
  draft: DraftDocument
  changes: ChangeSet
  dirty: Invalidation
  inverse: import('@whiteboard/core/types').Operation[]
  history: {
    footprint: Map<string, HistoryKey>
  }
  shortCircuit?: import('@whiteboard/core/types').KernelReduceResult
  reconcile: {
    tasks: ReconcileTask[]
    queued: Set<string>
  }
}

export const createChangeSet = (): ChangeSet => ({
  document: false,
  background: false,
  canvasOrder: false,
  nodes: changeSet.create<NodeId>(),
  edges: changeSet.create<EdgeId>(),
  groups: changeSet.create<GroupId>(),
  mindmaps: changeSet.create<MindmapId>()
})

export const createInvalidation = (): Invalidation => ({
  document: false,
  background: false,
  canvasOrder: false,
  nodes: new Set<NodeId>(),
  edges: new Set<EdgeId>(),
  groups: new Set<GroupId>(),
  mindmaps: new Set<MindmapId>(),
  projections: new Set<string>()
})

export const sameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
) => left.kind === right.kind && left.id === right.id

export const canvasRefId = (
  ref: CanvasItemRef
) => `${ref.kind}:${ref.id}`

export const appendCanvasRef = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
) => (
  order.some((entry) => sameCanvasRef(entry, ref))
    ? [...order]
    : [...order, ref]
)

export const removeCanvasRef = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
) => {
  const index = order.findIndex((entry) => sameCanvasRef(entry, ref))
  if (index < 0) return [...order]
  return [
    ...order.slice(0, index),
    ...order.slice(index + 1)
  ]
}

export const readCanvasSlot = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
) => {
  const index = order.findIndex((entry) => sameCanvasRef(entry, ref))
  if (index < 0) {
    return undefined
  }
  return {
    prev: order[index - 1],
    next: order[index + 1]
  }
}

export const insertCanvasSlot = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef,
  slot?: {
    prev?: CanvasItemRef
    next?: CanvasItemRef
  }
) => {
  const filtered = removeCanvasRef(order, ref)
  if (!slot) {
    return appendCanvasRef(filtered, ref)
  }
  if (slot.prev) {
    const index = filtered.findIndex((entry) => sameCanvasRef(entry, slot.prev!))
    if (index >= 0) {
      return [
        ...filtered.slice(0, index + 1),
        ref,
        ...filtered.slice(index + 1)
      ]
    }
  }
  if (slot.next) {
    const index = filtered.findIndex((entry) => sameCanvasRef(entry, slot.next!))
    if (index >= 0) {
      return [
        ...filtered.slice(0, index),
        ref,
        ...filtered.slice(index)
      ]
    }
  }
  return appendCanvasRef(filtered, ref)
}

export const createDraftDocument = (
  document: Document
): DraftDocument => ({
  base: document,
  background: document.background,
  canvasOrder: document.canvas.order,
  nodes: createOverlayTable(document.nodes),
  edges: createOverlayTable(document.edges),
  groups: createOverlayTable(document.groups),
  mindmaps: createOverlayTable(document.mindmaps)
})

export const materializeDraftDocument = (
  draft: DraftDocument
): Document => ({
  ...draft.base,
  background: draft.background,
  canvas: {
    order: [...draft.canvasOrder]
  },
  nodes: draft.nodes.materialize(),
  edges: draft.edges.materialize(),
  groups: draft.groups.materialize(),
  mindmaps: draft.mindmaps.materialize()
})

export const getNode = (
  draft: DraftDocument,
  id: NodeId
): Node | undefined => draft.nodes.get(id)

export const getEdge = (
  draft: DraftDocument,
  id: EdgeId
): Edge | undefined => draft.edges.get(id)

export const getMindmap = (
  draft: DraftDocument,
  id: MindmapId
): MindmapRecord | undefined => draft.mindmaps.get(id)

export const getMindmapTreeFromDraft = (
  draft: DraftDocument,
  id: string
) => {
  const direct = getMindmap(draft, id)
  if (direct) {
    return mindmapApi.tree.fromRecord(direct)
  }

  const node = getNode(draft, id)
  const mindmapId = node?.owner?.kind === 'mindmap'
    ? node.owner.id
    : undefined
  const record = mindmapId
    ? getMindmap(draft, mindmapId)
    : undefined
  return record
    ? mindmapApi.tree.fromRecord(record)
    : undefined
}

export const readCanvasOrder = (
  draft: DraftDocument
): readonly CanvasItemRef[] => draft.canvasOrder

export const writeCanvasOrder = (
  draft: DraftDocument,
  order: readonly CanvasItemRef[]
) => {
  draft.canvasOrder = order
}

export const isTopLevelNode = (
  draft: DraftDocument,
  node: Node | undefined
) => {
  if (!node) return false
  return !node.owner
}

export const isTopLevelMindmap = (
  draft: DraftDocument,
  id: MindmapId
) => Boolean(getMindmap(draft, id))

export const setMindmap = (
  draft: DraftDocument,
  mindmap: MindmapRecord
) => {
  draft.mindmaps.set(mindmap.id, mindmap)
  writeCanvasOrder(draft, appendCanvasRef(readCanvasOrder(draft), {
    kind: 'mindmap',
    id: mindmap.id
  }))
}

export const deleteMindmap = (
  draft: DraftDocument,
  mindmapId: MindmapId
) => {
  draft.mindmaps.delete(mindmapId)
  writeCanvasOrder(draft, removeCanvasRef(readCanvasOrder(draft), {
    kind: 'mindmap',
    id: mindmapId
  }))
}

export const setNode = (
  draft: DraftDocument,
  node: Node
) => {
  draft.nodes.set(node.id, node)
  if (isTopLevelNode(draft, node)) {
    writeCanvasOrder(draft, appendCanvasRef(readCanvasOrder(draft), {
      kind: 'node',
      id: node.id
    }))
  }
}

export const deleteNode = (
  draft: DraftDocument,
  nodeId: NodeId
) => {
  draft.nodes.delete(nodeId)
  const currentOrder = readCanvasOrder(draft)
  if (currentOrder.some((ref) => ref.kind === 'node' && ref.id === nodeId)) {
    writeCanvasOrder(draft, removeCanvasRef(currentOrder, {
      kind: 'node',
      id: nodeId
    }))
  }
}

export const setEdge = (
  draft: DraftDocument,
  edge: Edge
) => {
  draft.edges.set(edge.id, edge)
  writeCanvasOrder(draft, appendCanvasRef(readCanvasOrder(draft), {
    kind: 'edge',
    id: edge.id
  }))
}

export const deleteEdge = (
  draft: DraftDocument,
  edgeId: EdgeId
) => {
  draft.edges.delete(edgeId)
  writeCanvasOrder(draft, removeCanvasRef(readCanvasOrder(draft), {
    kind: 'edge',
    id: edgeId
  }))
}

export const relayoutMindmap = (
  draft: DraftDocument,
  id: string
) => {
  const record = getMindmap(draft, id)
  const tree = getMindmapTreeFromDraft(draft, id)
  if (!record || !tree) return

  const root = getNode(draft, record.root)
  if (!root) return

  const layout = mindmapApi.layout.compute(
    tree,
    (nodeId) => {
      const node = getNode(draft, nodeId)
      return {
        width: Math.max(node?.size?.width ?? 1, 1),
        height: Math.max(node?.size?.height ?? 1, 1)
      }
    },
    tree.layout
  )
  const anchored = mindmapApi.layout.anchor({
    tree,
    computed: layout,
    position: root.position
  })

  Object.entries(anchored.node).forEach(([nodeId, rect]) => {
    const current = getNode(draft, nodeId)
    if (!current) return
    draft.nodes.set(nodeId, {
      ...current,
      position: {
        x: rect.x,
        y: rect.y
      },
      size: {
        width: rect.width,
        height: rect.height
      }
    })
  })
}

export const collectConnectedEdges = (
  draft: DraftDocument,
  nodeIds: ReadonlySet<NodeId>
) => [...draft.edges.values()].filter((edge) => (
  (edge.source.kind === 'node' && nodeIds.has(edge.source.nodeId))
  || (edge.target.kind === 'node' && nodeIds.has(edge.target.nodeId))
))

export const createReduceRuntime = (
  document: Document
): ReduceRuntime => ({
  draft: createDraftDocument(document),
  changes: createChangeSet(),
  dirty: createInvalidation(),
  inverse: [],
  history: {
    footprint: new Map()
  },
  reconcile: {
    tasks: [],
    queued: new Set<string>()
  }
})
