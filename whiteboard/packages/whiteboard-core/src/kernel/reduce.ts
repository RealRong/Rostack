import type {
  CanvasItemRef,
  ChangeSet,
  Document,
  Edge,
  EdgeId,
  EdgePatch,
  Node,
  NodeId,
  Operation,
  Origin
} from '@whiteboard/core/types'
import {
  applyNodeUpdate,
  buildNodeUpdateInverse,
  classifyNodeUpdate
} from '@whiteboard/core/node'
import { getEdge, getNode } from '@whiteboard/core/document'
import { createId } from '@whiteboard/core/id'
import { err, ok } from '@whiteboard/core/result'
import type {
  KernelContext,
  KernelReadImpact,
  KernelReduceResult
} from '@whiteboard/core/kernel/types'

type NodeImpactState = {
  ids: Set<NodeId>
  geometry: boolean
  list: boolean
  value: boolean
}

type EdgeImpactState = {
  ids: Set<EdgeId>
  nodeIds: Set<NodeId>
  geometry: boolean
  list: boolean
  value: boolean
}

type MindmapImpactState = {
  ids: Set<NodeId>
  view: boolean
}

type ReadImpactState = {
  full: boolean
  document: boolean
  node: NodeImpactState
  edge: EdgeImpactState
  mindmap: MindmapImpactState
}

type ReduceDraft = {
  next: Document
  copied: {
    nodes: boolean
    edges: boolean
    groups: boolean
    order: boolean
    meta: boolean
  }
  read: ReadImpactState
  changes: Operation[]
  inverseGroups: Operation[][]
  timestamp: number
  origin?: Origin
}

type EdgePatchImpact = {
  geometry: boolean
  value: boolean
}

const DEFAULT_MAX_OPERATIONS = 100
const DEFAULT_MAX_IDS = 200
const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_EDGE_IDS: readonly EdgeId[] = []

const EDGE_GEOMETRY_KEYS = new Set<keyof EdgePatch>([
  'source',
  'target',
  'type',
  'route'
])

const EDGE_VALUE_KEYS = new Set<keyof EdgePatch>([
  'style',
  'textMode',
  'labels',
  'data'
])

const isMindmapNode = (node: Node | undefined) =>
  node?.type === 'mindmap'

const isCanvasNode = (node: Node | undefined) =>
  Boolean(node && node.type !== 'mindmap')

const addNodeId = (ids: Set<NodeId>, id: NodeId) => {
  ids.add(id)
}

const addEdgeId = (ids: Set<EdgeId>, id: EdgeId) => {
  ids.add(id)
}

const markMindmapView = (
  state: MindmapImpactState,
  id: NodeId
) => {
  state.ids.add(id)
  state.view = true
}

const toEdgeSnapshotPatch = (
  edge: Edge
): EdgePatch => ({
  source: edge.source,
  target: edge.target,
  type: edge.type,
  route: edge.route,
  style: edge.style,
  textMode: edge.textMode,
  labels: edge.labels,
  data: edge.data
})

const classifyEdgePatch = (patch: EdgePatch): EdgePatchImpact => {
  const impact: EdgePatchImpact = {
    geometry: false,
    value: false
  }

  for (const key of Object.keys(patch) as Array<keyof EdgePatch>) {
    if (EDGE_GEOMETRY_KEYS.has(key)) {
      impact.geometry = true
      continue
    }
    if (EDGE_VALUE_KEYS.has(key)) {
      impact.value = true
      continue
    }
    impact.geometry = true
    impact.value = true
  }

  return impact
}

const createReadImpactState = (operationCount: number): ReadImpactState => ({
  full: operationCount > DEFAULT_MAX_OPERATIONS,
  document: false,
  node: {
    ids: new Set<NodeId>(),
    geometry: false,
    list: false,
    value: false
  },
  edge: {
    ids: new Set<EdgeId>(),
    nodeIds: new Set<NodeId>(),
    geometry: false,
    list: false,
    value: false
  },
  mindmap: {
    ids: new Set<NodeId>(),
    view: false
  }
})

const trackReadImpact = (
  state: ReadImpactState,
  document: Document,
  operation: Operation
) => {
  if (state.full) return

  switch (operation.type) {
    case 'document.update': {
      state.document = true
      return
    }
    case 'node.create': {
      if (isMindmapNode(operation.node)) {
        markMindmapView(state.mindmap, operation.node.id)
        return
      }

      const { node } = state
      node.geometry = true
      node.list = true
      node.value = true
      addNodeId(node.ids, operation.node.id)
      return
    }
    case 'node.delete': {
      const before = getNode(document, operation.id)
      if (isMindmapNode(before)) {
        markMindmapView(state.mindmap, operation.id)
        return
      }

      const { node } = state
      node.geometry = true
      node.list = true
      node.value = true
      addNodeId(node.ids, operation.id)
      return
    }
    case 'node.update': {
      const before = getNode(document, operation.id)
      if (!before) {
        return
      }
      const impact = classifyNodeUpdate(operation.update)

      if (isCanvasNode(before)) {
        const { node } = state
        node.geometry ||= impact.geometry
        node.list ||= impact.list
        node.value ||= impact.value
        if (impact.geometry || impact.list || impact.value) {
          addNodeId(node.ids, operation.id)
        }
      }

      if (isMindmapNode(before) && impact.mindmapView) {
        markMindmapView(state.mindmap, operation.id)
      }

      if (impact.geometry && isCanvasNode(before)) {
        state.edge.geometry = true
        addNodeId(state.edge.nodeIds, operation.id)
      }
      return
    }
    case 'group.create':
    case 'group.update':
    case 'group.delete': {
      state.document = true
      state.node.list = true
      state.edge.list = true
      return
    }
    case 'edge.create': {
      state.edge.geometry = true
      state.edge.list = true
      addEdgeId(state.edge.ids, operation.edge.id)
      return
    }
    case 'edge.delete': {
      state.edge.geometry = true
      state.edge.list = true
      addEdgeId(state.edge.ids, operation.id)
      return
    }
    case 'edge.update': {
      const patch = classifyEdgePatch(operation.patch)
      state.edge.geometry ||= patch.geometry
      state.edge.value ||= patch.value
      if (patch.geometry || patch.value) {
        addEdgeId(state.edge.ids, operation.id)
      }
      return
    }
    case 'canvas.order.set': {
      state.node.list = true
      state.edge.list = true
      state.mindmap.view = true
      return
    }
  }
}

const finalizeReadImpact = (
  state: ReadImpactState
): KernelReadImpact => {
  if (
    state.full ||
    state.node.ids.size > DEFAULT_MAX_IDS ||
    state.edge.ids.size > DEFAULT_MAX_IDS ||
    state.edge.nodeIds.size > DEFAULT_MAX_IDS ||
    state.mindmap.ids.size > DEFAULT_MAX_IDS
  ) {
    return {
      reset: true,
      document: false,
      node: {
        ids: EMPTY_NODE_IDS,
        geometry: false,
        list: false,
        value: false
      },
      edge: {
        ids: EMPTY_EDGE_IDS,
        nodeIds: EMPTY_NODE_IDS,
        geometry: false,
        list: false,
        value: false
      },
      mindmap: {
        ids: EMPTY_NODE_IDS,
        view: false
      }
    }
  }

  return {
    reset: false,
    document: state.document,
    node: {
      ids: Array.from(state.node.ids),
      geometry: state.node.geometry,
      list: state.node.list,
      value: state.node.value
    },
    edge: {
      ids: Array.from(state.edge.ids),
      nodeIds: Array.from(state.edge.nodeIds),
      geometry: state.edge.geometry,
      list: state.edge.list,
      value: state.edge.value
    },
    mindmap: {
      ids: Array.from(state.mindmap.ids),
      view: state.mindmap.view
    }
  }
}
const isSameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
) => left.kind === right.kind && left.id === right.id

const appendOrderRef = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
): CanvasItemRef[] =>
  order.some((entry) => isSameCanvasRef(entry, ref))
    ? Array.from(order)
    : [...order, ref]

const removeOrderRef = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
): CanvasItemRef[] => {
  const index = order.findIndex((entry) => isSameCanvasRef(entry, ref))
  if (index < 0) return Array.from(order)
  return [
    ...order.slice(0, index),
    ...order.slice(index + 1)
  ]
}

const touch = (draft: ReduceDraft) => {
  const iso = new Date(draft.timestamp).toISOString()
  if (!draft.copied.meta) {
    draft.next.meta = draft.next.meta ? { ...draft.next.meta } : undefined
    draft.copied.meta = true
  }
  if (!draft.next.meta) {
    draft.next.meta = { createdAt: iso, updatedAt: iso }
    return
  }
  if (!draft.next.meta.createdAt) {
    draft.next.meta.createdAt = iso
  }
  draft.next.meta.updatedAt = iso
}

const ensureNodes = (draft: ReduceDraft): Document['nodes'] => {
  if (!draft.copied.nodes) {
    draft.next.nodes = { ...draft.next.nodes }
    draft.copied.nodes = true
  }
  return draft.next.nodes
}

const ensureEdges = (draft: ReduceDraft): Document['edges'] => {
  if (!draft.copied.edges) {
    draft.next.edges = { ...draft.next.edges }
    draft.copied.edges = true
  }
  return draft.next.edges
}

const ensureGroups = (draft: ReduceDraft): Document['groups'] => {
  if (!draft.copied.groups) {
    draft.next.groups = { ...draft.next.groups }
    draft.copied.groups = true
  }
  return draft.next.groups
}

const setCanvasOrder = (
  draft: ReduceDraft,
  order: readonly CanvasItemRef[]
) => {
  draft.next.order = Array.from(order)
  draft.copied.order = true
}

const buildInverse = (
  document: Document,
  operation: Operation
): Operation[] | null => {
  switch (operation.type) {
    case 'document.update': {
      return [{
        type: 'document.update',
        patch: {
          background: document.background
        }
      }]
    }
    case 'node.create': {
      return [{
        type: 'node.delete',
        id: operation.node.id
      }]
    }
    case 'node.update': {
      const current = getNode(document, operation.id)
      if (!current) return null
      const inverse = buildNodeUpdateInverse(current, operation.update)
      if (!inverse.ok) return null
      return [{
        type: 'node.update',
        id: operation.id,
        update: inverse.update
      }]
    }
    case 'node.delete': {
      const current = getNode(document, operation.id)
      if (!current) return null
      return [{
        type: 'node.create',
        node: current
      }]
    }
    case 'group.create': {
      return [{
        type: 'group.delete',
        id: operation.group.id
      }]
    }
    case 'group.update': {
      const current = document.groups[operation.id]
      if (!current) return null
      return [{
        type: 'group.update',
        id: operation.id,
        patch: {
          locked: current.locked,
          name: current.name
        }
      }]
    }
    case 'group.delete': {
      const current = document.groups[operation.id]
      if (!current) return null
      return [{
        type: 'group.create',
        group: current
      }]
    }
    case 'edge.create': {
      return [{
        type: 'edge.delete',
        id: operation.edge.id
      }]
    }
    case 'edge.update': {
      const current = getEdge(document, operation.id)
      if (!current) return null
      return [{
        type: 'edge.update',
        id: operation.id,
        patch: toEdgeSnapshotPatch(current)
      }]
    }
    case 'edge.delete': {
      const current = getEdge(document, operation.id)
      if (!current) return null
      return [{
        type: 'edge.create',
        edge: current
      }]
    }
    case 'canvas.order.set': {
      return [{
        type: 'canvas.order.set',
        refs: [...document.order]
      }]
    }
  }
}

const applyOperation = (
  draft: ReduceDraft,
  operation: Operation
) => {
  switch (operation.type) {
    case 'document.update': {
      draft.next = {
        ...draft.next,
        background: operation.patch.background
      }
      return
    }
    case 'node.create': {
      const nodes = ensureNodes(draft)
      nodes[operation.node.id] = operation.node
      setCanvasOrder(draft, appendOrderRef(draft.next.order, {
        kind: 'node',
        id: operation.node.id
      }))
      return
    }
    case 'node.update': {
      const current = getNode(draft.next, operation.id)
      if (!current) return
      const applied = applyNodeUpdate(current, operation.update)
      if (!applied.ok) return
      const nodes = ensureNodes(draft)
      nodes[operation.id] = applied.next
      return
    }
    case 'node.delete': {
      if (!getNode(draft.next, operation.id)) return
      const nodes = ensureNodes(draft)
      delete nodes[operation.id]
      setCanvasOrder(draft, removeOrderRef(draft.next.order, {
        kind: 'node',
        id: operation.id
      }))
      return
    }
    case 'group.create': {
      const groups = ensureGroups(draft)
      groups[operation.group.id] = operation.group
      return
    }
    case 'group.update': {
      const current = draft.next.groups[operation.id]
      if (!current) return
      const groups = ensureGroups(draft)
      groups[operation.id] = {
        ...current,
        ...operation.patch
      }
      return
    }
    case 'group.delete': {
      if (!draft.next.groups[operation.id]) return
      const groups = ensureGroups(draft)
      delete groups[operation.id]
      return
    }
    case 'edge.create': {
      const edges = ensureEdges(draft)
      edges[operation.edge.id] = operation.edge
      setCanvasOrder(draft, appendOrderRef(draft.next.order, {
        kind: 'edge',
        id: operation.edge.id
      }))
      return
    }
    case 'edge.update': {
      const current = getEdge(draft.next, operation.id)
      if (!current) return
      const edges = ensureEdges(draft)
      edges[operation.id] = {
        ...current,
        ...operation.patch
      }
      return
    }
    case 'edge.delete': {
      if (!getEdge(draft.next, operation.id)) return
      const edges = ensureEdges(draft)
      delete edges[operation.id]
      setCanvasOrder(draft, removeOrderRef(draft.next.order, {
        kind: 'edge',
        id: operation.id
      }))
      return
    }
    case 'canvas.order.set': {
      setCanvasOrder(draft, operation.refs)
      return
    }
  }
}

const createChangeSet = ({
  operations,
  timestamp,
  origin
}: {
  operations: ChangeSet['operations']
  timestamp: number
  origin?: Origin
}): ChangeSet => ({
  id: createId('change'),
  timestamp,
  operations,
  origin
})

export const reduceOperations = (
  document: Document,
  operations: readonly Operation[],
  context: KernelContext = {}
): KernelReduceResult => {
  if (operations.length === 0) {
    return err('invalid', 'No operations to apply.')
  }

  const timestamp = (context.now ?? (() => Date.now()))()
  const draft: ReduceDraft = {
    next: {
      ...document,
      nodes: document.nodes,
      edges: document.edges,
      meta: document.meta,
      background: document.background
    },
    copied: {
      nodes: false,
      edges: false,
      groups: false,
      order: false,
      meta: false
    },
    read: createReadImpactState(operations.length),
    changes: [],
    inverseGroups: [],
    timestamp,
    origin: context.origin ?? 'user'
  }

  for (const rawOperation of operations) {
    const inverseOperations = buildInverse(draft.next, rawOperation)
    if (!inverseOperations) {
      return err('invalid', 'Operation is not invertible.')
    }

    draft.changes.push(rawOperation)
    draft.inverseGroups.push(inverseOperations)
    trackReadImpact(draft.read, draft.next, rawOperation)
    applyOperation(draft, rawOperation)
  }

  touch(draft)

  const inverse: Operation[] = []
  for (let index = draft.inverseGroups.length - 1; index >= 0; index -= 1) {
    inverse.push(...draft.inverseGroups[index])
  }

  return ok({
    doc: draft.next,
    changes: createChangeSet({
      operations: draft.changes,
      timestamp: draft.timestamp,
      origin: draft.origin
    }),
    inverse,
    read: finalizeReadImpact(draft.read)
  })
}
