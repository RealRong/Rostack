import { applyNodeDefaults, getMissingNodeFields } from '../schema'
import { err, ok } from '../types'
import type {
  CanvasItemRef,
  CoreRegistries,
  Document,
  EdgeId,
  GroupId,
  Node,
  NodeId,
  NodeInput,
  Operation,
  Result,
  Size
} from '../types'
import {
  getNode,
  hasNode,
  listCanvasItemRefs,
  listEdges,
  listGroupEdgeIds,
  listGroupNodeIds,
  listNodes
} from '../types'
import {
  alignNodes,
  distributeNodes,
  type NodeAlignMode,
  type NodeDistributeMode,
  type NodeLayoutEntry,
  type NodeLayoutUpdate
} from './layout'
import { getNodeBoundsByNode } from './bounds'
import { createNodeFieldsUpdateOperation } from './update'
import {
  filterRootIds
} from './owner'

type NodeCreateOperationResult =
  Result<{
    operation: Extract<Operation, { type: 'node.create' }>
    nodeId: NodeId
  }, 'invalid'>

type NodeOperationsResult =
  Result<{
    operations: Operation[]
  }, 'invalid'>

type NodeGroupOperationResult =
  Result<{
    operations: Operation[]
    groupId: GroupId
  }, 'invalid'>

type NodeUngroupOperationResult =
  Result<{
    operations: Operation[]
    nodeIds: NodeId[]
    edgeIds: EdgeId[]
  }, 'invalid'>

type BuildNodeCreateOperationInput = {
  payload: NodeInput
  doc: Document
  registries: CoreRegistries
  createNodeId: () => NodeId
}

type BuildNodeGroupOperationsInput = {
  target: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }
  doc: Document
  createGroupId: () => NodeId
}

type BuildNodeLayoutOperationsInput = {
  ids: readonly NodeId[]
  doc: Document
  nodeSize: Size
}

const readLayoutEntries = ({
  ids,
  doc,
  nodeSize
}: BuildNodeLayoutOperationsInput): Result<{
  entries: NodeLayoutEntry[]
}, 'invalid'> => {
  const nodes = listNodes(doc)
  const rootIds = filterRootIds(nodes, ids)
  if (!rootIds.length) {
    return err('invalid', 'No node ids provided.')
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))
  const entries: NodeLayoutEntry[] = []
  for (const id of rootIds) {
    const node = nodeById.get(id)
    if (!node) {
      return err('invalid', `Node ${id} not found.`)
    }

    const bounds = getNodeBoundsByNode(node, nodeSize)
    const position = bounds
      ? {
          x: bounds.x,
          y: bounds.y
        }
      : undefined
    if (!bounds || !position) {
      return err('invalid', `Node ${id} has no layout bounds.`)
    }

    entries.push({
      id: node.id,
      position,
      bounds
    })
  }

  return ok({
    entries
  })
}

const buildLayoutOperations = (
  doc: Document,
  nodeSize: Size,
  updates: readonly NodeLayoutUpdate[]
): {
  operations: Operation[]
} => {
  const nodes = listNodes(doc)
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))
  const operations: Operation[] = []

  updates.forEach((update) => {
    const node = nodeById.get(update.id)
    if (!node) {
      return
    }

    operations.push(
      createNodeFieldsUpdateOperation(update.id, {
        position: update.position
      })
    )
  })

  return { operations }
}

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

export const buildNodeCreateOperation = ({
  payload,
  doc,
  registries,
  createNodeId
}: BuildNodeCreateOperationInput): NodeCreateOperationResult => {
  if (!payload.type) {
    return err('invalid', 'Missing node type.')
  }
  if (!payload.position) {
    return err('invalid', 'Missing node position.')
  }
  if (payload.id && hasNode(doc, payload.id)) {
    return err('invalid', `Node ${payload.id} already exists.`)
  }

  const typeDef = registries.nodeTypes.get(payload.type)
  if (typeDef?.validate && !typeDef.validate(payload.data)) {
    return err('invalid', `Node ${payload.type} validation failed.`)
  }

  const missing = getMissingNodeFields(payload, registries)
  if (missing.length > 0) {
    return err('invalid', `Missing required fields: ${missing.join(', ')}.`)
  }

  const normalized = applyNodeDefaults(payload, registries)
  const {
    ownerId: _ownerId,
    ...nextNode
  } = normalized
  const id = nextNode.id ?? createNodeId()
  const node: Node = {
    ...nextNode,
    id,
    layer: nextNode.type === 'frame'
      ? (nextNode.layer ?? 'background')
      : nextNode.layer
  }

  return ok({
    nodeId: id,
    operation: {
      type: 'node.create',
      node
    }
  })
}

export const buildNodeGroupOperations = ({
  target,
  doc,
  createGroupId
}: BuildNodeGroupOperationsInput): NodeGroupOperationResult => {
  const orderedNodes = listNodes(doc)
  const inputNodeIds = [...new Set(target.nodeIds ?? [])]
  const inputEdgeIds = [...new Set(target.edgeIds ?? [])]
  const rootIds = filterRootIds(orderedNodes, inputNodeIds)

  if (rootIds.length + inputEdgeIds.length < 2) {
    return err('invalid', 'At least two items are required.')
  }

  for (const id of rootIds) {
    const node = getNode(doc, id)
    if (!node) {
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
      ...rootIds.map((id) => getNode(doc, id)?.groupId),
      ...inputEdgeIds.map((id) => doc.edges[id]?.groupId)
    ]
      .filter((groupId): groupId is GroupId => Boolean(groupId))
  ))
  const groupId: GroupId = existingGroupIds[0] ?? createGroupId()
  const redundantGroupIds = new Set(existingGroupIds.slice(1))
  const memberIds = Array.from(new Set([
    ...rootIds,
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
    operations.push(
      createNodeFieldsUpdateOperation(id, {
        groupId
      })
    )
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

export const buildNodeAlignOperations = ({
  ids,
  doc,
  nodeSize,
  mode
}: BuildNodeLayoutOperationsInput & {
  mode: NodeAlignMode
}): NodeOperationsResult => {
  const entriesResult = readLayoutEntries({
    ids,
    doc,
    nodeSize
  })
  if (!entriesResult.ok) {
    return entriesResult
  }

  const updates = alignNodes(entriesResult.data.entries, mode)
  return ok(buildLayoutOperations(doc, nodeSize, updates))
}

export const buildNodeDistributeOperations = ({
  ids,
  doc,
  nodeSize,
  mode
}: BuildNodeLayoutOperationsInput & {
  mode: NodeDistributeMode
}): NodeOperationsResult => {
  const entriesResult = readLayoutEntries({
    ids,
    doc,
    nodeSize
  })
  if (!entriesResult.ok) {
    return entriesResult
  }

  const updates = distributeNodes(entriesResult.data.entries, mode)
  return ok(buildLayoutOperations(doc, nodeSize, updates))
}

export const buildNodeUngroupOperations = (
  id: NodeId,
  doc: Document
): NodeUngroupOperationResult => {
  return buildNodeUngroupManyOperations([id], doc)
}

export const buildNodeUngroupManyOperations = (
  ids: readonly NodeId[],
  doc: Document
): NodeUngroupOperationResult => {
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
      operations.push(
        createNodeFieldsUpdateOperation(node.id, {
          groupId: undefined
        })
      )
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
