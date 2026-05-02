import { edge as edgeApi } from '@whiteboard/core/edge'
import { createMutationReader } from '@shared/mutation'
import {
  createWhiteboardQuery,
  type WhiteboardQuery,
  type WhiteboardReader,
} from '@whiteboard/core/query'
import {
  whiteboardMutationSchema,
} from '@whiteboard/core/mutation/model'
import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeEnd,
  EdgeId,
  GroupId,
  MindmapId,
  NodeId,
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

const uniqueIds = <TId extends string>(
  ids: Iterable<TId>
): readonly TId[] => Array.from(new Set(ids))

const listGroupNodeIds = (
  query: WhiteboardQuery,
  groupId: GroupId
): readonly NodeId[] => query.group.refsInOrder(groupId)
  .flatMap((ref) => ref.kind === 'node' ? [ref.id] : [])

const collectLockedNodeIds = (
  reader: WhiteboardReader,
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
  reader: WhiteboardReader,
  edgeIds: readonly EdgeId[]
): readonly EdgeId[] => uniqueIds(
  edgeIds.filter((edgeId) => Boolean(reader.edge.get(edgeId)?.locked))
)

const collectLockedNodeIdsForEdgeIds = (
  reader: WhiteboardReader,
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
  reader: WhiteboardReader
  target: LockTarget
}): LockDecision => {
  const query = createWhiteboardQuery(reader)

  switch (target.kind) {
    case 'nodes': {
      const lockedNodeIds = collectLockedNodeIds(reader, target.nodeIds)
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
          collectLockedNodeIds(reader, listGroupNodeIds(query, groupId))
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
        reader,
        target.refs.flatMap((ref) => ref.kind === 'node' ? [ref.id] : [])
      )
      const directLockedEdgeIds = collectLockedEdgeIds(
        reader,
        target.refs.flatMap((ref) => ref.kind === 'edge' ? [ref.id] : [])
      )
      const relationLockedNodeIds = target.includeEdgeRelations
        ? collectLockedNodeIdsForEdgeIds(
            reader,
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
      const lockedEdgeIds = collectLockedEdgeIds(reader, target.edgeIds)
      const lockedNodeIds = collectLockedNodeIdsForEdgeIds(reader, target.edgeIds)
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
        (nodeId) => Boolean(reader.node.get(nodeId)?.locked),
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
