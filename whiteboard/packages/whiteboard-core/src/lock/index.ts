import {
  getEdge,
  getNode,
  listEdges,
  listGroupNodeIds,
  listNodes
} from '@whiteboard/core/document'
import {
  isNodeEdgeEnd,
  sameEdgeEnd
} from '@whiteboard/core/edge'
import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgePatch,
  EdgeEnd,
  EdgeId,
  GroupId,
  NodeFieldPatch,
  NodeId,
  NodePatch,
  NodeUpdateInput,
  Operation,
  Origin
} from '@whiteboard/core/types'

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

const NODE_NON_LOCK_FIELD_KEYS: Array<keyof Omit<NodeFieldPatch, 'locked'>> = [
  'position',
  'size',
  'rotation',
  'layer',
  'zIndex',
  'groupId'
]

const EDGE_NON_LOCK_PATCH_KEYS: Array<keyof Omit<EdgePatch, 'locked'>> = [
  'source',
  'target',
  'type',
  'groupId',
  'route',
  'style',
  'textMode',
  'labels',
  'data'
]

export type LockDecisionReason =
  | 'locked-node'
  | 'locked-edge'
  | 'locked-relation'

export type LockDecision = {
  allowed: boolean
  lockedNodeIds: readonly NodeId[]
  lockedEdgeIds: readonly EdgeId[]
  reason?: LockDecisionReason
}

export type LockTarget =
  | {
      kind: 'nodes'
      nodeIds: readonly NodeId[]
    }
  | {
      kind: 'groups'
      groupIds: readonly GroupId[]
    }
  | {
      kind: 'refs'
      refs: readonly CanvasItemRef[]
      includeEdgeRelations?: boolean
    }
  | {
      kind: 'edge-ids'
      edgeIds: readonly EdgeId[]
    }
  | {
      kind: 'edge-ends'
      ends: readonly (EdgeEnd | undefined)[]
    }

export type LockOperationViolation = {
  operation: Operation
  lockedNodeIds: readonly NodeId[]
  lockedEdgeIds: readonly EdgeId[]
  reason: LockDecisionReason
}

const uniqueIds = <TId extends string>(
  ids: Iterable<TId>
): readonly TId[] => Array.from(new Set(ids))

const collectLockedNodeIds = (
  document: Document,
  nodeIds: readonly NodeId[]
): readonly NodeId[] => uniqueIds(
  nodeIds.filter((nodeId) => Boolean(getNode(document, nodeId)?.locked))
)

const collectLockedNodeIdsFromEnds = (
  readNodeLocked: (nodeId: NodeId) => boolean,
  ends: readonly (EdgeEnd | undefined)[]
): readonly NodeId[] => uniqueIds(
  ends.flatMap((end) => (
    end && isNodeEdgeEnd(end) && readNodeLocked(end.nodeId)
      ? [end.nodeId]
      : []
  ))
)

const collectLockedEdgeIds = (
  document: Document,
  edgeIds: readonly EdgeId[]
): readonly EdgeId[] => uniqueIds(
  edgeIds.filter((edgeId) => Boolean(getEdge(document, edgeId)?.locked))
)

const collectLockedNodeIdsForEdgeIds = (
  document: Document,
  edgeIds: readonly EdgeId[]
): readonly NodeId[] => uniqueIds(
  edgeIds.flatMap((edgeId) => {
    const edge = getEdge(document, edgeId)
    if (!edge) {
      return []
    }

    return collectLockedNodeIdsFromEnds(
      (nodeId) => Boolean(getNode(document, nodeId)?.locked),
      [edge.source, edge.target]
    )
  })
)

export const resolveLockDecision = ({
  document,
  target
}: {
  document: Document
  target: LockTarget
}): LockDecision => {
  switch (target.kind) {
    case 'nodes': {
      const lockedNodeIds = collectLockedNodeIds(document, target.nodeIds)
      return {
        allowed: lockedNodeIds.length === 0,
        lockedNodeIds,
        lockedEdgeIds: [],
        reason: lockedNodeIds.length > 0 ? 'locked-node' : undefined
      }
    }
    case 'groups': {
      const lockedNodeIds = uniqueIds(
        target.groupIds.flatMap((groupId) =>
          collectLockedNodeIds(document, listGroupNodeIds(document, groupId))
        )
      )
      return {
        allowed: lockedNodeIds.length === 0,
        lockedNodeIds,
        lockedEdgeIds: [],
        reason: lockedNodeIds.length > 0 ? 'locked-node' : undefined
      }
    }
    case 'refs': {
      const directLockedNodeIds = collectLockedNodeIds(
        document,
        target.refs.flatMap((ref) => ref.kind === 'node' ? [ref.id] : [])
      )
      const directLockedEdgeIds = collectLockedEdgeIds(
        document,
        target.refs.flatMap((ref) => ref.kind === 'edge' ? [ref.id] : [])
      )
      const relationLockedNodeIds = target.includeEdgeRelations
        ? collectLockedNodeIdsForEdgeIds(
            document,
            target.refs.flatMap((ref) => ref.kind === 'edge' ? [ref.id] : [])
          )
        : []

      return {
        allowed:
          directLockedNodeIds.length === 0
          && directLockedEdgeIds.length === 0
          && relationLockedNodeIds.length === 0,
        lockedNodeIds: uniqueIds([
          ...directLockedNodeIds,
          ...relationLockedNodeIds
        ]),
        lockedEdgeIds: directLockedEdgeIds,
        reason:
          directLockedNodeIds.length > 0
            ? 'locked-node'
            : directLockedEdgeIds.length > 0
              ? 'locked-edge'
              : relationLockedNodeIds.length > 0
              ? 'locked-relation'
              : undefined
      }
    }
    case 'edge-ids': {
      const lockedEdgeIds = collectLockedEdgeIds(document, target.edgeIds)
      const lockedNodeIds = collectLockedNodeIdsForEdgeIds(document, target.edgeIds)
      return {
        allowed: lockedEdgeIds.length === 0 && lockedNodeIds.length === 0,
        lockedNodeIds,
        lockedEdgeIds,
        reason:
          lockedEdgeIds.length > 0
            ? 'locked-edge'
            : lockedNodeIds.length > 0
              ? 'locked-relation'
              : undefined
      }
    }
    case 'edge-ends': {
      const lockedNodeIds = collectLockedNodeIdsFromEnds(
        (nodeId) => Boolean(getNode(document, nodeId)?.locked),
        target.ends
      )
      return {
        allowed: lockedNodeIds.length === 0,
        lockedNodeIds,
        lockedEdgeIds: [],
        reason: lockedNodeIds.length > 0 ? 'locked-relation' : undefined
      }
    }
  }
}

const isLockOnlyNodePatch = (
  patch: NodePatch
) => {
  if (!hasOwn(patch, 'locked')) {
    return false
  }

  return NODE_NON_LOCK_FIELD_KEYS.every((key) => !hasOwn(patch, key))
}

const isLockOnlyEdgeUpdate = (
  patch: EdgePatch
) => {
  if (!hasOwn(patch, 'locked')) {
    return false
  }

  return EDGE_NON_LOCK_PATCH_KEYS.every((key) => !hasOwn(patch, key))
}

const readLockViolationForOperation = ({
  operation,
  readNodeLocked,
  readEdgeLocked,
  readEdge,
  updateNodeLocked,
  updateEdgeLocked
}: {
  operation: Operation
  readNodeLocked: (nodeId: NodeId) => boolean
  readEdgeLocked: (edgeId: EdgeId) => boolean
  readEdge: (edgeId: EdgeId) => Pick<Edge, 'source' | 'target'> | undefined
  updateNodeLocked: (nodeId: NodeId, locked: boolean) => void
  updateEdgeLocked: (edgeId: EdgeId, locked: boolean) => void
}): Omit<LockOperationViolation, 'operation'> | undefined => {
  switch (operation.type) {
    case 'node.create':
      updateNodeLocked(operation.node.id, Boolean(operation.node.locked))
      return undefined
    case 'node.patch': {
      if (readNodeLocked(operation.id) && !isLockOnlyNodePatch(operation.patch)) {
        return {
          lockedNodeIds: [operation.id],
          lockedEdgeIds: [],
          reason: 'locked-node'
        }
      }

      if (hasOwn(operation.patch, 'locked')) {
        updateNodeLocked(operation.id, Boolean(operation.patch.locked))
      }
      return undefined
    }
    case 'node.delete':
      if (readNodeLocked(operation.id)) {
        return {
          lockedNodeIds: [operation.id],
          lockedEdgeIds: [],
          reason: 'locked-node'
        }
      }
      updateNodeLocked(operation.id, false)
      return undefined
    case 'edge.create': {
      return (() => {
        const lockedNodeIds = collectLockedNodeIdsFromEnds(
          readNodeLocked,
          [operation.edge.source, operation.edge.target]
        )
        if (!lockedNodeIds.length) {
          return undefined
        }
        return {
          lockedNodeIds,
          lockedEdgeIds: [],
          reason: 'locked-relation' as const
        }
      })()
    }
    case 'edge.patch': {
      if (readEdgeLocked(operation.id) && !isLockOnlyEdgeUpdate(operation.patch)) {
        return {
          lockedNodeIds: [],
          lockedEdgeIds: [operation.id],
          reason: 'locked-edge'
        }
      }

      if (hasOwn(operation.patch, 'locked')) {
        updateEdgeLocked(operation.id, Boolean(operation.patch.locked))
      }

      const current = readEdge(operation.id)
      if (!current) {
        return undefined
      }

      const sourceChanged = (
        hasOwn(operation.patch, 'source')
        && operation.patch.source
        && !sameEdgeEnd(current.source, operation.patch.source)
      )
      const targetChanged = (
        hasOwn(operation.patch, 'target')
        && operation.patch.target
        && !sameEdgeEnd(current.target, operation.patch.target)
      )
      if (!sourceChanged && !targetChanged) {
        return undefined
      }

      const nextSource = operation.patch.source ?? current.source
      const nextTarget = operation.patch.target ?? current.target
      const lockedNodeIds = collectLockedNodeIdsFromEnds(
        readNodeLocked,
        [current.source, current.target, nextSource, nextTarget]
      )
      if (!lockedNodeIds.length) {
        return undefined
      }

      return {
        lockedNodeIds,
        lockedEdgeIds: [],
        reason: 'locked-relation'
      }
    }
    case 'edge.delete': {
      if (readEdgeLocked(operation.id)) {
        return {
          lockedNodeIds: [],
          lockedEdgeIds: [operation.id],
          reason: 'locked-edge'
        }
      }

      const current = readEdge(operation.id)
      if (!current) {
        return undefined
      }

      const lockedNodeIds = collectLockedNodeIdsFromEnds(
        readNodeLocked,
        [current.source, current.target]
      )
      if (!lockedNodeIds.length) {
        return undefined
      }

      return {
        lockedNodeIds,
        lockedEdgeIds: [],
        reason: 'locked-relation'
      }
    }
    case 'canvas.order': {
      const lockedNodeIds = uniqueIds(
        operation.refs.flatMap((ref) => (
          ref.kind === 'node' && readNodeLocked(ref.id)
            ? [ref.id]
            : []
        ))
      )
      const lockedEdgeIds = uniqueIds(
        operation.refs.flatMap((ref) => (
          ref.kind === 'edge' && readEdgeLocked(ref.id)
            ? [ref.id]
            : []
        ))
      )
      if (lockedNodeIds.length > 0) {
        return {
          lockedNodeIds,
          lockedEdgeIds: [],
          reason: 'locked-node'
        }
      }
      if (lockedEdgeIds.length > 0) {
        return {
          lockedNodeIds: [],
          lockedEdgeIds,
          reason: 'locked-edge'
        }
      }
      return undefined
    }
    default:
      return undefined
  }
}

export const validateLockOperations = ({
  document,
  operations,
  origin
}: {
  document: Document
  operations: readonly Operation[]
  origin: Origin
}): LockOperationViolation | undefined => {
  if (origin === 'system') {
    return undefined
  }

  const nodeLocked = new Map<NodeId, boolean>(
    listNodes(document).map((node) => [node.id, Boolean(node.locked)] as const)
  )
  const edgeLocked = new Map<EdgeId, boolean>(
    listEdges(document).map((edge) => [edge.id, Boolean(edge.locked)] as const)
  )
  const edgeById = new Map<EdgeId, Pick<Edge, 'source' | 'target'>>(
    listEdges(document).map((edge) => [
      edge.id,
      {
        source: edge.source,
        target: edge.target
      }
    ] as const)
  )

  const readNodeLocked = (nodeId: NodeId) => nodeLocked.get(nodeId) === true
  const updateNodeLocked = (nodeId: NodeId, locked: boolean) => {
    nodeLocked.set(nodeId, locked)
  }
  const readEdgeLocked = (edgeId: EdgeId) => edgeLocked.get(edgeId) === true
  const updateEdgeLocked = (edgeId: EdgeId, locked: boolean) => {
    edgeLocked.set(edgeId, locked)
  }
  const readEdge = (edgeId: EdgeId) => edgeById.get(edgeId)
  const updateEdge = (edgeId: EdgeId, edge: Pick<Edge, 'source' | 'target'>) => {
    edgeById.set(edgeId, edge)
  }
  const deleteEdge = (edgeId: EdgeId) => {
    edgeById.delete(edgeId)
    edgeLocked.delete(edgeId)
  }

  for (const operation of operations) {
    const violation = readLockViolationForOperation({
      operation,
      readNodeLocked,
      readEdgeLocked,
      readEdge,
      updateNodeLocked,
      updateEdgeLocked
    })
    if (violation) {
      return {
        operation,
        ...violation
      }
    }

    switch (operation.type) {
      case 'edge.create':
        updateEdge(operation.edge.id, {
          source: operation.edge.source,
          target: operation.edge.target
        })
        updateEdgeLocked(operation.edge.id, Boolean(operation.edge.locked))
        break
      case 'edge.patch': {
        const current = readEdge(operation.id)
        if (!current) {
          break
        }
        updateEdge(operation.id, {
          source: operation.patch.source ?? current.source,
          target: operation.patch.target ?? current.target
        })
        break
      }
      case 'edge.delete':
        deleteEdge(operation.id)
        break
      case 'node.delete':
        nodeLocked.delete(operation.id)
        break
      default:
        break
    }
  }

  return undefined
}
