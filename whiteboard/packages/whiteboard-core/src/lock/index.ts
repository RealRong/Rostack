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
  EdgeEnd,
  EdgeId,
  GroupId,
  NodeFieldPatch,
  NodeId,
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

export type LockDecisionReason = 'locked-node' | 'locked-relation'

export type LockDecision = {
  allowed: boolean
  lockedNodeIds: readonly NodeId[]
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
  reason: LockDecisionReason
}

const uniqueNodeIds = (
  ids: Iterable<NodeId>
): readonly NodeId[] => Array.from(new Set(ids))

const collectLockedNodeIds = (
  document: Document,
  nodeIds: readonly NodeId[]
): readonly NodeId[] => uniqueNodeIds(
  nodeIds.filter((nodeId) => Boolean(getNode(document, nodeId)?.locked))
)

const collectLockedNodeIdsFromEnds = (
  readNodeLocked: (nodeId: NodeId) => boolean,
  ends: readonly (EdgeEnd | undefined)[]
): readonly NodeId[] => uniqueNodeIds(
  ends.flatMap((end) => (
    end && isNodeEdgeEnd(end) && readNodeLocked(end.nodeId)
      ? [end.nodeId]
      : []
  ))
)

const collectLockedNodeIdsForEdgeIds = (
  document: Document,
  edgeIds: readonly EdgeId[]
): readonly NodeId[] => uniqueNodeIds(
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
        reason: lockedNodeIds.length > 0 ? 'locked-node' : undefined
      }
    }
    case 'groups': {
      const lockedNodeIds = uniqueNodeIds(
        target.groupIds.flatMap((groupId) =>
          collectLockedNodeIds(document, listGroupNodeIds(document, groupId))
        )
      )
      return {
        allowed: lockedNodeIds.length === 0,
        lockedNodeIds,
        reason: lockedNodeIds.length > 0 ? 'locked-node' : undefined
      }
    }
    case 'refs': {
      const directLockedNodeIds = collectLockedNodeIds(
        document,
        target.refs.flatMap((ref) => ref.kind === 'node' ? [ref.id] : [])
      )
      const relationLockedNodeIds = target.includeEdgeRelations
        ? collectLockedNodeIdsForEdgeIds(
            document,
            target.refs.flatMap((ref) => ref.kind === 'edge' ? [ref.id] : [])
          )
        : []
      const lockedNodeIds = uniqueNodeIds([
        ...directLockedNodeIds,
        ...relationLockedNodeIds
      ])

      return {
        allowed: lockedNodeIds.length === 0,
        lockedNodeIds,
        reason:
          directLockedNodeIds.length > 0
            ? 'locked-node'
            : relationLockedNodeIds.length > 0
              ? 'locked-relation'
              : undefined
      }
    }
    case 'edge-ids': {
      const lockedNodeIds = collectLockedNodeIdsForEdgeIds(document, target.edgeIds)
      return {
        allowed: lockedNodeIds.length === 0,
        lockedNodeIds,
        reason: lockedNodeIds.length > 0 ? 'locked-relation' : undefined
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
        reason: lockedNodeIds.length > 0 ? 'locked-relation' : undefined
      }
    }
  }
}

const isLockOnlyNodeUpdate = (
  update: NodeUpdateInput
) => {
  if (update.records?.length) {
    return false
  }
  const { fields } = update
  if (!fields || !hasOwn(fields, 'locked')) {
    return false
  }

  return NODE_NON_LOCK_FIELD_KEYS.every((key) => !hasOwn(fields, key))
}

const readLockViolationForOperation = ({
  operation,
  readNodeLocked,
  readEdge,
  updateNodeLocked
}: {
  operation: Operation
  readNodeLocked: (nodeId: NodeId) => boolean
  readEdge: (edgeId: EdgeId) => Pick<Edge, 'source' | 'target'> | undefined
  updateNodeLocked: (nodeId: NodeId, locked: boolean) => void
}): Omit<LockOperationViolation, 'operation'> | undefined => {
  switch (operation.type) {
    case 'node.create':
      updateNodeLocked(operation.node.id, Boolean(operation.node.locked))
      return undefined
    case 'node.update': {
      if (readNodeLocked(operation.id) && !isLockOnlyNodeUpdate(operation.update)) {
        return {
          lockedNodeIds: [operation.id],
          reason: 'locked-node'
        }
      }

      if (
        operation.update.fields
        && hasOwn(operation.update.fields, 'locked')
      ) {
        updateNodeLocked(operation.id, Boolean(operation.update.fields.locked))
      }
      return undefined
    }
    case 'node.delete':
      if (readNodeLocked(operation.id)) {
        return {
          lockedNodeIds: [operation.id],
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
          reason: 'locked-relation' as const
        }
      })()
    }
    case 'edge.update': {
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
        reason: 'locked-relation'
      }
    }
    case 'edge.delete': {
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
        reason: 'locked-relation'
      }
    }
    case 'canvas.order.set': {
      const lockedNodeIds = uniqueNodeIds(
        operation.refs.flatMap((ref) => (
          ref.kind === 'node' && readNodeLocked(ref.id)
            ? [ref.id]
            : []
        ))
      )
      if (!lockedNodeIds.length) {
        return undefined
      }

      return {
        lockedNodeIds,
        reason: 'locked-node'
      }
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
  const readEdge = (edgeId: EdgeId) => edgeById.get(edgeId)
  const updateEdge = (edgeId: EdgeId, edge: Pick<Edge, 'source' | 'target'>) => {
    edgeById.set(edgeId, edge)
  }
  const deleteEdge = (edgeId: EdgeId) => {
    edgeById.delete(edgeId)
  }

  for (const operation of operations) {
    const violation = readLockViolationForOperation({
      operation,
      readNodeLocked,
      readEdge,
      updateNodeLocked
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
        break
      case 'edge.update': {
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
