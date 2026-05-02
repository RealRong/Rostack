import { edge as edgeApi } from '@whiteboard/core/edge'
import {
  createDocumentReader,
  type DocumentReader
} from '@whiteboard/core/document'
import type {
  WhiteboardCompileReader
} from '@whiteboard/core/mutation/compile/reader'
import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeEnd,
  EdgeFieldPatch,
  EdgeId,
  GroupId,
  MindmapId,
  NodeId,
  Operation,
  Origin
} from '@whiteboard/core/types'

type LockReader = {
  document: {
    order(): {
      groupRefs(groupId: GroupId): readonly CanvasItemRef[]
    }
  }
  node: {
    get(nodeId: NodeId): Document['nodes'][NodeId] | undefined
  }
  edge: {
    get(edgeId: EdgeId): Document['edges'][EdgeId] | undefined
  }
  mindmap: {
    get(id: MindmapId): Document['mindmaps'][MindmapId] | undefined
    subtreeNodeIds(id: MindmapId, rootId?: NodeId): readonly NodeId[]
    isRoot(nodeId: NodeId): boolean
  }
}

const toLockReader = (
  reader: DocumentReader | WhiteboardCompileReader | LockReader
): LockReader => 'node' in reader
  ? reader
  : {
      document: {
        order: () => ({
          groupRefs: (groupId) => reader.documentOrder.groupRefs(groupId)
        })
      },
      node: {
        get: (nodeId) => reader.nodes.get(nodeId)
      },
      edge: {
        get: (edgeId) => reader.edges.get(edgeId)
      },
      mindmap: {
        get: (id) => reader.mindmaps.get(id),
        subtreeNodeIds: (id, rootId) => reader.mindmaps.subtreeNodeIds(id, rootId),
        isRoot: (nodeId) => reader.mindmaps.isRoot(nodeId)
      }
    }

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

const listGroupNodeIds = (
  reader: LockReader,
  groupId: GroupId
): readonly NodeId[] => reader.document.order().groupRefs(groupId)
  .flatMap((ref) => ref.kind === 'node' ? [ref.id] : [])

const collectLockedNodeIds = (
  reader: LockReader,
  nodeIds: readonly NodeId[]
): readonly NodeId[] => uniqueIds(
  nodeIds.filter((nodeId) => Boolean(reader.node.get(nodeId)?.locked))
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
  reader: LockReader,
  edgeIds: readonly EdgeId[]
): readonly EdgeId[] => uniqueIds(
  edgeIds.filter((edgeId) => Boolean(reader.edge.get(edgeId)?.locked))
)

const collectLockedNodeIdsForEdgeIds = (
  reader: LockReader,
  edgeIds: readonly EdgeId[]
): readonly NodeId[] => uniqueIds(
  edgeIds.flatMap((edgeId) => {
    const edge = reader.edge.get(edgeId)
    if (!edge) {
      return []
    }

    return collectLockedNodeIdsFromEnds(
      (nodeId) => Boolean(reader.node.get(nodeId)?.locked),
      [edge.source, edge.target]
    )
  })
)

export const resolveLockDecision = ({
  reader,
  target
}: {
  reader: LockReader | DocumentReader | WhiteboardCompileReader
  target: LockTarget
}): LockDecision => {
  const lockReader = toLockReader(reader)

  switch (target.kind) {
    case 'nodes': {
      const lockedNodeIds = collectLockedNodeIds(lockReader, target.nodeIds)
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
          collectLockedNodeIds(lockReader, listGroupNodeIds(lockReader, groupId))
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
        lockReader,
        target.refs.flatMap((ref) => ref.kind === 'node' ? [ref.id] : [])
      )
      const directLockedEdgeIds = collectLockedEdgeIds(
        lockReader,
        target.refs.flatMap((ref) => ref.kind === 'edge' ? [ref.id] : [])
      )
      const relationLockedNodeIds = target.includeEdgeRelations
        ? collectLockedNodeIdsForEdgeIds(
            lockReader,
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
      const lockedEdgeIds = collectLockedEdgeIds(lockReader, target.edgeIds)
      const lockedNodeIds = collectLockedNodeIdsForEdgeIds(lockReader, target.edgeIds)
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
        (nodeId) => Boolean(lockReader.node.get(nodeId)?.locked),
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

const isNodeLockOnlyPatch = (
  operation: Extract<Operation, { type: 'node.patch' }>
) => {
  const fields = operation.patch
  if (!fields || Object.hasOwn(operation.patch, 'data') || Object.hasOwn(operation.patch, 'style')) {
    return false
  }

  const keys = Object.keys(fields)
  return keys.length === 1 && hasOwn(fields, 'locked')
}

const isEdgeLockOnlyPatch = (
  operation: Extract<Operation, { type: 'edge.patch' }>
) => {
  const fields = operation.patch
  if (
    !fields
    || Object.hasOwn(operation.patch, 'route')
    || Object.hasOwn(operation.patch, 'style')
    || Object.hasOwn(operation.patch, 'labels')
    || Object.hasOwn(operation.patch, 'data')
  ) {
    return false
  }

  const keys = Object.keys(fields)
  return keys.length === 1 && hasOwn(fields, 'locked')
}

const isMindmapTopicLockOnlyPatch = (
  operation: Extract<Operation, { type: 'mindmap.topic.patch' }>
) => {
  const fields = operation.patch
  if (!fields || Object.hasOwn(operation.patch, 'data') || Object.hasOwn(operation.patch, 'style')) {
    return false
  }

  const keys = Object.keys(fields)
  return keys.length === 1 && hasOwn(fields, 'locked')
}

const readNextEdgeEnd = (
  current: Edge['source'] | Edge['target'],
  fields: EdgeFieldPatch | undefined,
  key: 'source' | 'target'
) => fields && hasOwn(fields, key)
  ? fields[key] ?? current
  : current

const readLockViolationForOperation = ({
  reader,
  operation,
  readNodeLocked,
  readEdgeLocked,
  readEdge,
  updateNodeLocked,
  updateEdgeLocked
}: {
  reader: LockReader
  operation: Operation
  readNodeLocked: (nodeId: NodeId) => boolean
  readEdgeLocked: (edgeId: EdgeId) => boolean
  readEdge: (edgeId: EdgeId) => Pick<Edge, 'source' | 'target'> | undefined
  updateNodeLocked: (nodeId: NodeId, locked: boolean) => void
  updateEdgeLocked: (edgeId: EdgeId, locked: boolean) => void
}): Omit<LockOperationViolation, 'operation'> | undefined => {
  switch (operation.type) {
    case 'node.create':
      updateNodeLocked(operation.value.id, Boolean(operation.value.locked))
      return undefined
    case 'node.patch': {
      if (readNodeLocked(operation.id) && !isNodeLockOnlyPatch(operation)) {
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
      const lockedNodeIds = collectLockedNodeIdsFromEnds(
        readNodeLocked,
        [operation.value.source, operation.value.target]
      )
      return lockedNodeIds.length
        ? {
            lockedNodeIds,
            lockedEdgeIds: [],
            reason: 'locked-relation'
          }
        : undefined
    }
    case 'edge.patch': {
      const edgeId = operation.id
      if (
        readEdgeLocked(edgeId)
        && !(operation.type === 'edge.patch' && isEdgeLockOnlyPatch(operation))
      ) {
        return {
          lockedNodeIds: [],
          lockedEdgeIds: [edgeId],
          reason: 'locked-edge'
        }
      }

      if (
        operation.type === 'edge.patch'
        && hasOwn(operation.patch, 'locked')
      ) {
        updateEdgeLocked(edgeId, Boolean(operation.patch.locked))
      }

      const current = readEdge(edgeId)
      if (!current) {
        return undefined
      }

      const nextSource = readNextEdgeEnd(current.source, operation.patch, 'source')
      const nextTarget = readNextEdgeEnd(current.target, operation.patch, 'target')
      const sourceChanged = !edgeApi.equal.sameEnd(current.source, nextSource)
      const targetChanged = !edgeApi.equal.sameEnd(current.target, nextTarget)
      if (!sourceChanged && !targetChanged) {
        return undefined
      }

      const lockedNodeIds = collectLockedNodeIdsFromEnds(
        readNodeLocked,
        [current.source, current.target, nextSource, nextTarget]
      )
      return lockedNodeIds.length
        ? {
            lockedNodeIds,
            lockedEdgeIds: [],
            reason: 'locked-relation'
          }
        : undefined
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
      return lockedNodeIds.length
        ? {
            lockedNodeIds,
            lockedEdgeIds: [],
            reason: 'locked-relation'
          }
        : undefined
    }
    case 'mindmap.create':
      operation.nodes.forEach((node) => {
        updateNodeLocked(node.id, Boolean(node.locked))
      })
      return undefined
    case 'mindmap.restore':
      operation.snapshot.nodes.forEach((node) => {
        updateNodeLocked(node.id, Boolean(node.locked))
      })
      return undefined
    case 'mindmap.delete': {
      const lockedNodeIds = reader.mindmap.subtreeNodeIds(operation.id)
        .filter((nodeId) => readNodeLocked(nodeId))
      return lockedNodeIds.length
        ? {
            lockedNodeIds,
            lockedEdgeIds: [],
            reason: 'locked-node'
          }
        : undefined
    }
    case 'mindmap.move': {
      const rootId = reader.mindmap.get(operation.id)?.root
      return rootId && readNodeLocked(rootId)
        ? {
            lockedNodeIds: [rootId],
            lockedEdgeIds: [],
            reason: 'locked-node'
          }
        : undefined
    }
    case 'mindmap.layout': {
      const lockedNodeIds = reader.mindmap.subtreeNodeIds(operation.id)
        .filter((nodeId) => readNodeLocked(nodeId))
      return lockedNodeIds.length
        ? {
            lockedNodeIds,
            lockedEdgeIds: [],
            reason: 'locked-node'
          }
        : undefined
    }
    case 'mindmap.topic.insert':
      if (operation.input.kind === 'child') {
        if (readNodeLocked(operation.input.parentId)) {
          return {
            lockedNodeIds: [operation.input.parentId],
            lockedEdgeIds: [],
            reason: 'locked-node'
          }
        }
      } else if (readNodeLocked(operation.input.nodeId)) {
        return {
          lockedNodeIds: [operation.input.nodeId],
          lockedEdgeIds: [],
          reason: 'locked-node'
        }
      }
      updateNodeLocked(operation.node.id, Boolean(operation.node.locked))
      return undefined
    case 'mindmap.topic.restore':
      operation.snapshot.nodes.forEach((node) => {
        updateNodeLocked(node.id, Boolean(node.locked))
      })
      return undefined
    case 'mindmap.topic.move': {
      const lockedNodeIds = uniqueIds([
        ...(readNodeLocked(operation.input.nodeId) ? [operation.input.nodeId] : []),
        ...(readNodeLocked(operation.input.parentId) ? [operation.input.parentId] : [])
      ])
      return lockedNodeIds.length
        ? {
            lockedNodeIds,
            lockedEdgeIds: [],
            reason: 'locked-node'
          }
        : undefined
    }
    case 'mindmap.topic.delete': {
      const lockedNodeIds = reader.mindmap.subtreeNodeIds(
        operation.id,
        operation.input.nodeId
      ).filter((nodeId) => readNodeLocked(nodeId))
      return lockedNodeIds.length
        ? {
            lockedNodeIds,
            lockedEdgeIds: [],
            reason: 'locked-node'
          }
        : undefined
    }
    case 'mindmap.topic.patch': {
      if (readNodeLocked(operation.topicId) && !isMindmapTopicLockOnlyPatch(operation)) {
        return {
          lockedNodeIds: [operation.topicId],
          lockedEdgeIds: [],
          reason: 'locked-node'
        }
      }

      if (hasOwn(operation.patch, 'locked')) {
        updateNodeLocked(operation.topicId, Boolean(operation.patch.locked))
      }
      return undefined
    }
    case 'mindmap.branch.patch':
    case 'mindmap.topic.collapse':
      return readNodeLocked(operation.topicId)
        ? {
            lockedNodeIds: [operation.topicId],
            lockedEdgeIds: [],
            reason: 'locked-node'
          }
        : undefined
    case 'document.order.move': {
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

  const reader = toLockReader(createDocumentReader(() => document))
  const nodeLocked = new Map<NodeId, boolean>(
    Object.values(document.nodes).map((node) => [node.id, Boolean(node.locked)] as const)
  )
  const edgeLocked = new Map<EdgeId, boolean>(
    Object.values(document.edges).map((edge) => [edge.id, Boolean(edge.locked)] as const)
  )
  const edgeById = new Map<EdgeId, Pick<Edge, 'source' | 'target'>>(
    Object.values(document.edges).map((edge) => [
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
  const deleteNodeLocked = (nodeId: NodeId) => {
    nodeLocked.delete(nodeId)
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
      reader,
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
        updateEdge(operation.value.id, {
          source: operation.value.source,
          target: operation.value.target
        })
        updateEdgeLocked(operation.value.id, Boolean(operation.value.locked))
        break
      case 'edge.patch': {
        const current = readEdge(operation.id)
        if (!current) {
          break
        }

        updateEdge(operation.id, {
          source: readNextEdgeEnd(current.source, operation.patch, 'source'),
          target: readNextEdgeEnd(current.target, operation.patch, 'target')
        })
        break
      }
      case 'edge.delete':
        deleteEdge(operation.id)
        break
      case 'node.delete':
        deleteNodeLocked(operation.id)
        break
      case 'mindmap.delete':
        reader.mindmap.subtreeNodeIds(operation.id).forEach(deleteNodeLocked)
        break
      case 'mindmap.topic.delete':
        reader.mindmap.subtreeNodeIds(operation.id, operation.input.nodeId).forEach(deleteNodeLocked)
        break
      default:
        break
    }
  }

  return undefined
}
