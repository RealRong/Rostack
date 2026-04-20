import { document as documentApi } from '@whiteboard/core/document'
import { edge as edgeApi } from '@whiteboard/core/edge'
import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeEnd,
  EdgeId,
  GroupId,
  NodeId,
  Operation,
  Origin
} from '@whiteboard/core/types'

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

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
  nodeIds.filter((nodeId) => Boolean(documentApi.read.node(document, nodeId)?.locked))
)

const collectLockedNodeIdsFromEnds = (
  readNodeLocked: (nodeId: NodeId) => boolean,
  ends: readonly (EdgeEnd | undefined)[]
): readonly NodeId[] => uniqueIds(
  ends.flatMap((end) => (
    end && edgeApi.guard.isNodeEnd(end) && readNodeLocked(end.nodeId)
      ? [end.nodeId]
      : []
  ))
)

const collectLockedEdgeIds = (
  document: Document,
  edgeIds: readonly EdgeId[]
): readonly EdgeId[] => uniqueIds(
  edgeIds.filter((edgeId) => Boolean(documentApi.read.edge(document, edgeId)?.locked))
)

const collectLockedNodeIdsForEdgeIds = (
  document: Document,
  edgeIds: readonly EdgeId[]
): readonly NodeId[] => uniqueIds(
  edgeIds.flatMap((edgeId) => {
    const edge = documentApi.read.edge(document, edgeId)
    if (!edge) {
      return []
    }

    return collectLockedNodeIdsFromEnds(
      (nodeId) => Boolean(documentApi.read.node(document, nodeId)?.locked),
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
          collectLockedNodeIds(document, documentApi.list.groupNodeIds(document, groupId))
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
        (nodeId) => Boolean(documentApi.read.node(document, nodeId)?.locked),
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

const isNodeLockOnlyOperation = (
  operation: Operation
) => (
  (operation.type === 'node.field.set' && operation.field === 'locked')
  || (operation.type === 'node.field.unset' && operation.field === 'locked')
)

const isEdgeLockOnlyOperation = (
  operation: Operation
) => (
  (operation.type === 'edge.field.set' && operation.field === 'locked')
  || (operation.type === 'edge.field.unset' && operation.field === 'locked')
)

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
    case 'node.field.set':
    case 'node.field.unset':
    case 'node.record.set':
    case 'node.record.unset': {
      if (readNodeLocked(operation.id) && !isNodeLockOnlyOperation(operation)) {
        return {
          lockedNodeIds: [operation.id],
          lockedEdgeIds: [],
          reason: 'locked-node'
        }
      }

      if (operation.type === 'node.field.set' && operation.field === 'locked') {
        updateNodeLocked(operation.id, Boolean(operation.value))
      }
      if (operation.type === 'node.field.unset' && operation.field === 'locked') {
        updateNodeLocked(operation.id, false)
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
    case 'edge.field.set':
    case 'edge.field.unset':
    case 'edge.record.set':
    case 'edge.record.unset':
    case 'edge.label.insert':
    case 'edge.label.delete':
    case 'edge.label.move':
    case 'edge.label.field.set':
    case 'edge.label.field.unset':
    case 'edge.label.record.set':
    case 'edge.label.record.unset':
    case 'edge.route.point.insert':
    case 'edge.route.point.delete':
    case 'edge.route.point.move':
    case 'edge.route.point.field.set': {
      const edgeId = 'id' in operation
        ? operation.id
        : operation.edgeId
      if (readEdgeLocked(edgeId) && !isEdgeLockOnlyOperation(operation)) {
        return {
          lockedNodeIds: [],
          lockedEdgeIds: [edgeId],
          reason: 'locked-edge'
        }
      }

      if (operation.type === 'edge.field.set' && operation.field === 'locked') {
        updateEdgeLocked(edgeId, Boolean(operation.value))
      }
      if (operation.type === 'edge.field.unset' && operation.field === 'locked') {
        updateEdgeLocked(edgeId, false)
      }

      const current = readEdge(edgeId)
      if (!current) {
        return undefined
      }

      const sourceChanged = (
        operation.type === 'edge.field.set'
        && operation.field === 'source'
        && !edgeApi.equal.sameEnd(current.source, operation.value as Edge['source'])
      )
      const targetChanged = (
        operation.type === 'edge.field.set'
        && operation.field === 'target'
        && !edgeApi.equal.sameEnd(current.target, operation.value as Edge['target'])
      )
      if (!sourceChanged && !targetChanged) {
        return undefined
      }

      const nextSource = operation.type === 'edge.field.set' && operation.field === 'source'
        ? operation.value as Edge['source']
        : current.source
      const nextTarget = operation.type === 'edge.field.set' && operation.field === 'target'
        ? operation.value as Edge['target']
        : current.target
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
    case 'canvas.order.move': {
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
    documentApi.list.nodes(document).map((node) => [node.id, Boolean(node.locked)] as const)
  )
  const edgeLocked = new Map<EdgeId, boolean>(
    documentApi.list.edges(document).map((edge) => [edge.id, Boolean(edge.locked)] as const)
  )
  const edgeById = new Map<EdgeId, Pick<Edge, 'source' | 'target'>>(
    documentApi.list.edges(document).map((edge) => [
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
      case 'edge.field.set':
        if (operation.field === 'source' || operation.field === 'target') {
          const current = readEdge(operation.id)
          if (!current) {
            break
          }
          updateEdge(operation.id, {
            source: operation.field === 'source'
              ? operation.value as Edge['source']
              : current.source,
            target: operation.field === 'target'
              ? operation.value as Edge['target']
              : current.target
          })
        }
        break
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
