import type {
  ChangeSet,
  Document,
  Edge,
  EdgeId,
  EdgePatch,
  Node,
  NodeId,
  Operation,
  Origin
} from '../types'
import {
  err,
  getEdge,
  getNode,
  ok
} from '../types'
import {
  applyNodeUpdate,
  buildNodeUpdateInverse,
  classifyNodeUpdate
} from '../node'
import { createId } from '../utils/id'
import type {
  KernelContext,
  KernelReadImpact,
  KernelReduceResult
} from './types'

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
    nodeEntities: boolean
    edgeEntities: boolean
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
  'label',
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
  label: edge.label,
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
    case 'node.order.set': {
      state.node.list = true
      state.mindmap.view = true
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
    case 'edge.order.set': {
      state.edge.list = true
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
const appendOrderId = <T extends string>(order: readonly T[], id: T): T[] =>
  order.includes(id) ? Array.from(order) : [...order, id]

const removeOrderId = <T extends string>(order: readonly T[], id: T): T[] => {
  const index = order.indexOf(id)
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

const ensureNodeEntities = (draft: ReduceDraft): Document['nodes']['entities'] => {
  if (!draft.copied.nodeEntities) {
    draft.next.nodes = {
      ...draft.next.nodes,
      entities: { ...draft.next.nodes.entities }
    }
    draft.copied.nodeEntities = true
  }
  return draft.next.nodes.entities
}

const ensureEdgeEntities = (draft: ReduceDraft): Document['edges']['entities'] => {
  if (!draft.copied.edgeEntities) {
    draft.next.edges = {
      ...draft.next.edges,
      entities: { ...draft.next.edges.entities }
    }
    draft.copied.edgeEntities = true
  }
  return draft.next.edges.entities
}

const setNodeOrder = (
  draft: ReduceDraft,
  order: readonly NodeId[]
) => {
  draft.next.nodes = {
    ...draft.next.nodes,
    order: Array.from(order)
  }
}

const setEdgeOrder = (
  draft: ReduceDraft,
  order: readonly EdgeId[]
) => {
  draft.next.edges = {
    ...draft.next.edges,
    order: Array.from(order)
  }
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
    case 'node.order.set': {
      return [{
        type: 'node.order.set',
        ids: [...document.nodes.order]
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
    case 'edge.order.set': {
      return [{
        type: 'edge.order.set',
        ids: [...document.edges.order]
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
      const entities = ensureNodeEntities(draft)
      entities[operation.node.id] = operation.node
      setNodeOrder(draft, appendOrderId(draft.next.nodes.order, operation.node.id))
      return
    }
    case 'node.update': {
      const current = getNode(draft.next, operation.id)
      if (!current) return
      const applied = applyNodeUpdate(current, operation.update)
      if (!applied.ok) return
      const entities = ensureNodeEntities(draft)
      entities[operation.id] = applied.next
      return
    }
    case 'node.delete': {
      if (!getNode(draft.next, operation.id)) return
      const entities = ensureNodeEntities(draft)
      delete entities[operation.id]
      setNodeOrder(draft, removeOrderId(draft.next.nodes.order, operation.id))
      return
    }
    case 'node.order.set': {
      setNodeOrder(draft, operation.ids)
      return
    }
    case 'edge.create': {
      const entities = ensureEdgeEntities(draft)
      entities[operation.edge.id] = operation.edge
      setEdgeOrder(draft, appendOrderId(draft.next.edges.order, operation.edge.id))
      return
    }
    case 'edge.update': {
      const current = getEdge(draft.next, operation.id)
      if (!current) return
      const entities = ensureEdgeEntities(draft)
      entities[operation.id] = {
        ...current,
        ...operation.patch
      }
      return
    }
    case 'edge.delete': {
      if (!getEdge(draft.next, operation.id)) return
      const entities = ensureEdgeEntities(draft)
      delete entities[operation.id]
      setEdgeOrder(draft, removeOrderId(draft.next.edges.order, operation.id))
      return
    }
    case 'edge.order.set': {
      setEdgeOrder(draft, operation.ids)
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
      nodeEntities: false,
      edgeEntities: false,
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
