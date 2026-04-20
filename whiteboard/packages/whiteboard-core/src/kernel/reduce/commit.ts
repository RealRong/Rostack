import { err, ok } from '@whiteboard/core/result'
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
import { materializeDraftDocument } from '@whiteboard/core/kernel/reduce/runtime'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'

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

export const finalizeDirty = (
  dirty: Invalidation
): Invalidation => {
  if (dirty.nodes.size > 0) {
    dirty.projections.add('node')
  }
  if (dirty.edges.size > 0 || dirty.nodes.size > 0) {
    dirty.projections.add('edge')
  }
  if (dirty.mindmaps.size > 0 || dirty.nodes.size > 0) {
    dirty.projections.add('mindmap')
  }
  return dirty
}

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

export const createCommitApi = (
  tx: ReducerTx
) => ({
  result: () => {
    if (tx._runtime.shortCircuit) {
      return tx._runtime.shortCircuit
    }

    const invalidation = finalizeDirty(tx._runtime.dirty)
    return ok({
      doc: materializeDraftDocument(tx._runtime.draft),
      changes: tx._runtime.changes,
      invalidation,
      inverse: tx._runtime.inverse,
      impact: deriveImpact(invalidation)
    })
  }
})

export const createDocumentReplaceResult = (
  tx: ReducerTx,
  document: import('@whiteboard/core/types').Document
) => {
  tx._runtime.shortCircuit = ok({
    doc: document,
    changes: {
      ...createChangeSet(),
      document: true,
      background: true,
      canvasOrder: true
    },
    invalidation: finalizeDirty({
      ...createInvalidation(),
      document: true,
      background: true,
      canvasOrder: true
    }),
    inverse: tx._runtime.inverse,
    impact: RESET_READ_IMPACT
  })
}
