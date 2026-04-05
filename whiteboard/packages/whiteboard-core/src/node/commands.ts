import { applyNodeDefaults, getMissingNodeFields } from '../schema'
import { err, ok } from '../types'
import type {
  CoreRegistries,
  Document,
  Node,
  NodeId,
  NodeInput,
  Operation,
  Result,
  Size
} from '../types'
import { getNode, hasNode, listNodes } from '../types'
import {
  alignNodes,
  distributeNodes,
  type NodeAlignMode,
  type NodeDistributeMode,
  type NodeLayoutEntry,
  type NodeLayoutUpdate
} from './layout'
import {
  getGroupDescendants,
  getNodesBoundingRect,
  sanitizeGroupNode
} from './group'
import { getNodeBoundsByNode } from './bounds'
import {
  buildMoveSet,
  projectMovePositions
} from './move'
import { createNodeFieldsUpdateOperation } from './update'
import {
  createOwnerDepthResolver,
  createOwnerState,
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
    groupId: NodeId
  }, 'invalid'>

type NodeUngroupOperationResult =
  Result<{
    operations: Operation[]
    nodeIds: NodeId[]
  }, 'invalid'>

type BuildNodeCreateOperationInput = {
  payload: NodeInput
  doc: Document
  registries: CoreRegistries
  createNodeId: () => NodeId
}

type BuildNodeGroupOperationsInput = {
  ids: NodeId[]
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

    const bounds = node.type === 'group'
      ? getNodesBoundingRect(
          getGroupDescendants(nodes, node.id),
          nodeSize
        )
      : getNodeBoundsByNode(node, nodeSize)
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

    if (node.type !== 'group') {
      operations.push(
        createNodeFieldsUpdateOperation(update.id, {
          position: update.position
        })
      )
      return
    }

    const bounds = getNodesBoundingRect(
      getGroupDescendants(nodes, node.id),
      nodeSize
    )
    if (!bounds) {
      return
    }

    const delta = {
      x: update.position.x - bounds.x,
      y: update.position.y - bounds.y
    }
    if (delta.x === 0 && delta.y === 0) {
      return
    }

    projectMovePositions(
      buildMoveSet({
        nodes,
        ids: [node.id],
        nodeSize
      }).members,
      delta
    ).forEach((entry) => {
      operations.push(
        createNodeFieldsUpdateOperation(entry.id, {
          position: entry.position
        })
      )
    })
  })

  return { operations }
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
  if (payload.type !== 'group' && !payload.position) {
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
    layer:
      nextNode.type === 'group' || nextNode.type === 'frame'
        ? (nextNode.layer ?? 'background')
        : nextNode.layer
  }

  return ok({
    nodeId: id,
    operation: {
      type: 'node.create',
      node: sanitizeGroupNode(node)
    }
  })
}

export const buildNodeGroupOperations = ({
  ids,
  doc,
  createGroupId
}: BuildNodeGroupOperationsInput): NodeGroupOperationResult => {
  const orderedNodes = listNodes(doc)
  const rootIds = filterRootIds(orderedNodes, ids)
  if (!rootIds.length) {
    return err('invalid', 'No node ids provided.')
  }

  for (const id of rootIds) {
    const node = getNode(doc, id)
    if (!node) {
      return err('invalid', `Node ${id} not found.`)
    }
  }

  const ownerState = createOwnerState(doc)
  const directOwnerIds = rootIds.map((id) => ownerState.owner(id))
  const sharedOwnerId = directOwnerIds.every((ownerId) => ownerId === directOwnerIds[0])
    ? directOwnerIds[0]
    : undefined
  const groupId = createGroupId()
  const selectedIdSet = new Set(rootIds)
  const operations: Operation[] = [{
    type: 'node.create',
    node: {
      id: groupId,
      type: 'group',
      layer: 'background',
      children: rootIds
    }
  }]

  if (sharedOwnerId) {
    const result = ownerState.replace(sharedOwnerId, selectedIdSet, [groupId])
    if (!result.ok) {
      return result
    }
  } else {
    const ownerIds = Array.from(new Set(directOwnerIds.filter((ownerId): ownerId is NodeId => Boolean(ownerId))))
    for (const ownerId of ownerIds) {
      const result = ownerState.replace(ownerId, selectedIdSet, [])
      if (!result.ok) {
        return result
      }
    }
  }

  operations.push(...ownerState.patches())

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
  const uniqueIds = Array.from(new Set(ids))
  if (!uniqueIds.length) {
    return err('invalid', 'No group ids provided.')
  }

  const nodeById = new Map<NodeId, Node>(orderedNodes.map((node) => [node.id, node]))
  const ownerState = createOwnerState(doc)
  const groups: Node[] = []

  for (const id of uniqueIds) {
    const group = nodeById.get(id)
    if (!group) {
      return err('invalid', `Node ${id} not found.`)
    }
    if (group.type !== 'group') {
      return err('invalid', `Node ${id} is not a group.`)
    }
    groups.push(group)
  }

  const resolveDepth = createOwnerDepthResolver({
    readNode: (nodeId) => nodeById.get(nodeId),
    readOwnerId: (nodeId) => ownerState.owner(nodeId),
    include: (node) => node.type === 'group'
  })

  const deletedGroupIds = new Set<NodeId>()
  const nodeIds: NodeId[] = []
  const selectedNodeIds = new Set<NodeId>()

  const orderedGroups = groups
    .sort((left, right) => resolveDepth(right.id) - resolveDepth(left.id))

  for (const group of orderedGroups) {
    const currentChildren = [...ownerState.children(group.id)]
    const ownerId = ownerState.owner(group.id)

    if (ownerId) {
      const result = ownerState.replace(
        ownerId,
        new Set([group.id]),
        currentChildren
      )
      if (!result.ok) {
        return result
      }
    } else {
      for (const childId of currentChildren) {
        const result = ownerState.setOwner(childId, undefined)
        if (!result.ok) {
          return result
        }
      }
    }

    ownerState.removeNode(group.id)
    deletedGroupIds.add(group.id)

    currentChildren.forEach((childId) => {
      if (deletedGroupIds.has(childId) || selectedNodeIds.has(childId)) {
        return
      }
      selectedNodeIds.add(childId)
      nodeIds.push(childId)
    })
  }

  const operations: Operation[] = [
    ...ownerState.patches(deletedGroupIds)
  ]

  deletedGroupIds.forEach((groupId) => {
    operations.push({
      type: 'node.delete',
      id: groupId
    })
  })

  return ok({
    nodeIds,
    operations
  })
}
