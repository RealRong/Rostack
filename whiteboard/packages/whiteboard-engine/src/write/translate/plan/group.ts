import type { OrderMode } from '@engine-types/command'
import {
  getNode,
  listCanvasItemRefs,
  listGroupEdgeIds,
  listGroupNodeIds,
  listEdges,
  listNodes
} from '@whiteboard/core/document'
import { createNodeFieldsUpdateOperation } from '@whiteboard/core/node'
import { err, ok } from '@whiteboard/core/result'
import type { Document, EdgeId, GroupId, NodeId, Operation } from '@whiteboard/core/types'
import {
  moveIntoBlock,
  normalizeOrder
} from '../order/policy'
import {
  groupRefs,
  orderedRefs,
  sameOrder
} from '../order/refs'
import type { Step } from './shared'

type MergeTarget = {
  nodeIds?: readonly NodeId[]
  edgeIds?: readonly EdgeId[]
}

const groupIdsOf = (
  doc: Document,
  nodeIds: readonly NodeId[],
  edgeIds: readonly EdgeId[]
) => Array.from(new Set(
  [
    ...nodeIds.map((id) => getNode(doc, id)?.groupId),
    ...edgeIds.map((id) => doc.edges[id]?.groupId)
  ].filter((id): id is GroupId => Boolean(id))
))

export const merge = ({
  target,
  doc,
  createGroupId
}: {
  target: MergeTarget
  doc: Document
  createGroupId: () => GroupId
}): Step<{ groupId: GroupId }> => {
  const nodeIdsIn = Array.from(new Set(target.nodeIds ?? []))
  const edgeIdsIn = Array.from(new Set(target.edgeIds ?? []))

  if (nodeIdsIn.length + edgeIdsIn.length < 2) {
    return err('invalid', 'At least two items are required.')
  }

  for (const id of nodeIdsIn) {
    if (!getNode(doc, id)) {
      return err('invalid', `Node ${id} not found.`)
    }
  }
  for (const id of edgeIdsIn) {
    if (!doc.edges[id]) {
      return err('invalid', `Edge ${id} not found.`)
    }
  }

  const existing = groupIdsOf(doc, nodeIdsIn, edgeIdsIn)
  const groupId = existing[0] ?? createGroupId()
  const merged = new Set(existing.slice(1))
  const nodeIds = Array.from(new Set([
    ...nodeIdsIn,
    ...listGroupNodeIds(doc, groupId),
    ...Array.from(merged).flatMap((id) => listGroupNodeIds(doc, id))
  ]))
  const edgeIds = Array.from(new Set([
    ...edgeIdsIn,
    ...listGroupEdgeIds(doc, groupId),
    ...Array.from(merged).flatMap((id) => listGroupEdgeIds(doc, id))
  ]))

  const operations: Operation[] = doc.groups[groupId]
    ? []
    : [{
        type: 'group.create' as const,
        group: { id: groupId }
      }]

  nodeIds.forEach((id) => {
    operations.push(createNodeFieldsUpdateOperation(id, { groupId }))
  })

  edgeIds.forEach((id) => {
    operations.push({
      type: 'edge.update' as const,
      id,
      patch: { groupId }
    })
  })

  const order = moveIntoBlock(
    listCanvasItemRefs(doc),
    orderedRefs(doc, { nodeIds, edgeIds })
  )
  if (order) {
    operations.push({
      type: 'canvas.order.set',
      refs: order
    })
  }

  merged.forEach((id) => {
    operations.push({
      type: 'group.delete',
      id
    })
  })

  return ok({
    operations,
    output: { groupId }
  })
}

export const ungroupMany = (
  ids: readonly GroupId[],
  doc: Document
): Step<{ nodeIds: NodeId[]; edgeIds: EdgeId[] }> => {
  const groups = Array.from(new Set(ids))
  if (!groups.length) {
    return err('cancelled', 'No groups selected.')
  }

  const operations: Operation[] = []
  const nodeIds: NodeId[] = []
  const edgeIds: EdgeId[] = []

  groups.forEach((groupId) => {
    if (!doc.groups[groupId]) {
      return
    }

    listNodes(doc).forEach((node) => {
      if (node.groupId !== groupId) {
        return
      }

      nodeIds.push(node.id)
      operations.push(createNodeFieldsUpdateOperation(node.id, {
        groupId: undefined
      }))
    })

    listEdges(doc).forEach((edge) => {
      if (edge.groupId !== groupId) {
        return
      }

      edgeIds.push(edge.id)
      operations.push({
        type: 'edge.update' as const,
        id: edge.id,
        patch: {
          groupId: undefined
        }
      })
    })

    operations.push({
      type: 'group.delete' as const,
      id: groupId
    })
  })

  if (!operations.length) {
    return err('cancelled', 'No groups selected.')
  }

  return ok({
    operations,
    output: {
      nodeIds: Array.from(new Set(nodeIds)),
      edgeIds: Array.from(new Set(edgeIds))
    }
  })
}

export const order = ({
  ids,
  mode,
  doc
}: {
  ids: readonly GroupId[]
  mode: OrderMode
  doc: Pick<Document, 'nodes' | 'edges' | 'order' | 'groups'>
}): Step => {
  const refs = groupRefs({ doc, ids })
  if (!refs.length) {
    return err('cancelled', 'No groups selected.')
  }

  const next = normalizeOrder({
    doc,
    refs,
    mode
  })
  if (sameOrder(next.current, next.next)) {
    return err('cancelled', 'Order is already current.')
  }

  return ok({
    operations: [{
      type: 'canvas.order.set',
      refs: next.next
    }],
    output: undefined
  })
}
