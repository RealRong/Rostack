import { err, ok } from '../types'
import type {
  CanvasItemRef,
  Document,
  EdgeId,
  GroupId,
  NodeId,
  Operation,
  Result
} from '../types'
import {
  getNode,
  listCanvasItemRefs,
  listEdges,
  listGroupEdgeIds,
  listGroupNodeIds,
  listNodes
} from '../types'
import { createNodeFieldsUpdateOperation } from '../node/update'

type GroupOperationsResult = Result<{
  operations: Operation[]
  groupId: GroupId
}, 'invalid'>

type GroupUngroupOperationsResult = Result<{
  operations: Operation[]
  nodeIds: NodeId[]
  edgeIds: EdgeId[]
}, 'invalid'>

const isSameCanvasItemRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
) => left.kind === right.kind && left.id === right.id

const toOrderedMemberRefs = ({
  doc,
  nodeIds,
  edgeIds
}: {
  doc: Document
  nodeIds: readonly NodeId[]
  edgeIds: readonly EdgeId[]
}): CanvasItemRef[] => {
  const keys = new Set([
    ...nodeIds.map((id) => `node:${id}`),
    ...edgeIds.map((id) => `edge:${id}`)
  ])

  return listCanvasItemRefs(doc)
    .filter((ref) => keys.has(`${ref.kind}:${ref.id}`))
}

const moveRefsIntoContiguousBlock = (
  current: readonly CanvasItemRef[],
  refs: readonly CanvasItemRef[]
): CanvasItemRef[] | undefined => {
  if (!refs.length) {
    return undefined
  }

  const firstIndex = current.findIndex((entry) => (
    refs.some((ref) => isSameCanvasItemRef(entry, ref))
  ))
  if (firstIndex < 0) {
    return undefined
  }

  const kept = current.filter((entry) => (
    !refs.some((ref) => isSameCanvasItemRef(entry, ref))
  ))
  const next = [
    ...kept.slice(0, firstIndex),
    ...refs,
    ...kept.slice(firstIndex)
  ]

  return next.every((entry, index) => isSameCanvasItemRef(entry, current[index]!))
    ? undefined
    : next
}

export const buildGroupMergeOperations = ({
  target,
  doc,
  createGroupId
}: {
  target: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }
  doc: Document
  createGroupId: () => GroupId
}): GroupOperationsResult => {
  const inputNodeIds = Array.from(new Set(target.nodeIds ?? []))
  const inputEdgeIds = Array.from(new Set(target.edgeIds ?? []))

  if (inputNodeIds.length + inputEdgeIds.length < 2) {
    return err('invalid', 'At least two items are required.')
  }

  for (const id of inputNodeIds) {
    if (!getNode(doc, id)) {
      return err('invalid', `Node ${id} not found.`)
    }
  }
  for (const id of inputEdgeIds) {
    if (!doc.edges[id]) {
      return err('invalid', `Edge ${id} not found.`)
    }
  }

  const existingGroupIds = Array.from(new Set(
    [
      ...inputNodeIds.map((id) => getNode(doc, id)?.groupId),
      ...inputEdgeIds.map((id) => doc.edges[id]?.groupId)
    ].filter((groupId): groupId is GroupId => Boolean(groupId))
  ))
  const groupId = existingGroupIds[0] ?? createGroupId()
  const redundantGroupIds = new Set(existingGroupIds.slice(1))
  const memberIds = Array.from(new Set([
    ...inputNodeIds,
    ...listGroupNodeIds(doc, groupId),
    ...Array.from(redundantGroupIds).flatMap((id) => listGroupNodeIds(doc, id))
  ]))
  const memberEdgeIds = Array.from(new Set([
    ...inputEdgeIds,
    ...listGroupEdgeIds(doc, groupId),
    ...Array.from(redundantGroupIds).flatMap((id) => listGroupEdgeIds(doc, id))
  ]))

  const operations: Operation[] = doc.groups[groupId]
    ? []
    : [{
        type: 'group.create',
        group: {
          id: groupId
        }
      }]

  memberIds.forEach((id) => {
    operations.push(createNodeFieldsUpdateOperation(id, {
      groupId
    }))
  })

  memberEdgeIds.forEach((id) => {
    operations.push({
      type: 'edge.update',
      id,
      patch: {
        groupId
      }
    })
  })

  const nextOrder = moveRefsIntoContiguousBlock(
    listCanvasItemRefs(doc),
    toOrderedMemberRefs({
      doc,
      nodeIds: memberIds,
      edgeIds: memberEdgeIds
    })
  )
  if (nextOrder) {
    operations.push({
      type: 'canvas.order.set',
      refs: nextOrder
    })
  }

  redundantGroupIds.forEach((id) => {
    operations.push({
      type: 'group.delete',
      id
    })
  })

  return ok({
    groupId,
    operations
  })
}

export const buildGroupUngroupOperations = (
  id: GroupId,
  doc: Document
): GroupUngroupOperationsResult => buildGroupUngroupManyOperations([id], doc)

export const buildGroupUngroupManyOperations = (
  ids: readonly GroupId[],
  doc: Document
): GroupUngroupOperationsResult => {
  const orderedNodes = listNodes(doc)
  const orderedEdges = listEdges(doc)
  const uniqueIds = Array.from(new Set(ids))
  if (!uniqueIds.length) {
    return err('invalid', 'No group ids provided.')
  }

  const operations: Operation[] = []
  const nodeIds: NodeId[] = []
  const edgeIds: EdgeId[] = []

  uniqueIds.forEach((groupId) => {
    if (!doc.groups[groupId]) {
      return
    }

    orderedNodes.forEach((node) => {
      if (node.groupId !== groupId) {
        return
      }

      nodeIds.push(node.id)
      operations.push(createNodeFieldsUpdateOperation(node.id, {
        groupId: undefined
      }))
    })

    orderedEdges.forEach((edge) => {
      if (edge.groupId !== groupId) {
        return
      }

      edgeIds.push(edge.id)
      operations.push({
        type: 'edge.update',
        id: edge.id,
        patch: {
          groupId: undefined
        }
      })
    })

    operations.push({
      type: 'group.delete',
      id: groupId
    })
  })

  return ok({
    nodeIds: Array.from(new Set(nodeIds)),
    edgeIds: Array.from(new Set(edgeIds)),
    operations
  })
}
