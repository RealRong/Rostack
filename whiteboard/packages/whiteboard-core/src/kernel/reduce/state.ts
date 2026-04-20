import type {
  ChangeIds,
  ChangeSet,
  Invalidation,
  KernelReadImpact,
  NodeId,
  EdgeId,
  GroupId,
  MindmapId,
  Operation
} from '@whiteboard/core/types'

const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_EDGE_IDS: readonly EdgeId[] = []

export const RESET_READ_IMPACT: KernelReadImpact = {
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
  }
}

export const createChangeIds = <Id extends string>(): ChangeIds<Id> => ({
  add: new Set<Id>(),
  update: new Set<Id>(),
  delete: new Set<Id>()
})

export const createChangeSet = (): ChangeSet => ({
  document: false,
  background: false,
  canvasOrder: false,
  nodes: createChangeIds<NodeId>(),
  edges: createChangeIds<EdgeId>(),
  groups: createChangeIds<GroupId>(),
  mindmaps: createChangeIds<MindmapId>()
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

export const deriveImpact = (
  invalidation: Invalidation
): KernelReadImpact => {
  const nodeIds = [...invalidation.nodes]
  const edgeIds = [...invalidation.edges]
  const reset = invalidation.document

  return {
    reset,
    document: invalidation.document || invalidation.background,
    node: {
      ids: reset ? EMPTY_NODE_IDS : nodeIds,
      geometry: reset || invalidation.canvasOrder || invalidation.mindmaps.size > 0 || nodeIds.length > 0,
      list: reset || invalidation.canvasOrder,
      value: reset || invalidation.mindmaps.size > 0 || nodeIds.length > 0
    },
    edge: {
      ids: reset ? EMPTY_EDGE_IDS : edgeIds,
      nodeIds: reset ? EMPTY_NODE_IDS : nodeIds,
      geometry: reset || invalidation.canvasOrder || nodeIds.length > 0 || edgeIds.length > 0,
      list: reset || invalidation.canvasOrder,
      value: reset || nodeIds.length > 0 || edgeIds.length > 0
    }
  }
}

export const readLockViolationMessage = (
  reason: 'locked-node' | 'locked-edge' | 'locked-relation',
  operation: Operation
) => {
  const action = (
    operation.type === 'node.create'
    || operation.type === 'edge.create'
  )
    ? 'duplicated'
    : 'modified'

  if (reason === 'locked-node') {
    return `Locked nodes cannot be ${action}.`
  }
  if (reason === 'locked-edge') {
    return `Locked edges cannot be ${action}.`
  }
  return `Locked node relations cannot be ${action}.`
}

export const markChange = <Id extends string>(
  bucket: ChangeIds<Id>,
  kind: 'add' | 'update' | 'delete',
  id: Id
) => {
  if (kind === 'add') {
    bucket.delete.delete(id)
    bucket.update.delete(id)
    bucket.add.add(id)
    return
  }
  if (kind === 'update') {
    if (!bucket.add.has(id) && !bucket.delete.has(id)) {
      bucket.update.add(id)
    }
    return
  }
  if (bucket.add.delete(id)) {
    bucket.update.delete(id)
    return
  }
  bucket.update.delete(id)
  bucket.delete.add(id)
}

export const deriveInvalidation = (
  changes: ChangeSet
): Invalidation => {
  const invalidation = createInvalidation()

  invalidation.document = changes.document
  invalidation.background = changes.background
  invalidation.canvasOrder = changes.canvasOrder

  changes.nodes.add.forEach((id) => invalidation.nodes.add(id))
  changes.nodes.update.forEach((id) => invalidation.nodes.add(id))
  changes.nodes.delete.forEach((id) => invalidation.nodes.add(id))

  changes.edges.add.forEach((id) => invalidation.edges.add(id))
  changes.edges.update.forEach((id) => invalidation.edges.add(id))
  changes.edges.delete.forEach((id) => invalidation.edges.add(id))

  changes.groups.add.forEach((id) => invalidation.groups.add(id))
  changes.groups.update.forEach((id) => invalidation.groups.add(id))
  changes.groups.delete.forEach((id) => invalidation.groups.add(id))

  changes.mindmaps.add.forEach((id) => invalidation.mindmaps.add(id))
  changes.mindmaps.update.forEach((id) => invalidation.mindmaps.add(id))
  changes.mindmaps.delete.forEach((id) => invalidation.mindmaps.add(id))

  if (invalidation.nodes.size > 0) {
    invalidation.projections.add('node')
  }
  if (invalidation.edges.size > 0 || invalidation.nodes.size > 0) {
    invalidation.projections.add('edge')
  }
  if (invalidation.mindmaps.size > 0 || invalidation.nodes.size > 0) {
    invalidation.projections.add('mindmap')
  }

  return invalidation
}
