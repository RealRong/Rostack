import { schema as schemaApi } from '@whiteboard/core/schema'
import { document as documentApi } from '@whiteboard/core/document'
import { err, ok } from '@whiteboard/core/result'
import type {
  CoreRegistries,
  Document,
  Node,
  NodeId,
  NodeInput,
  Operation,
  Result,
  Size
} from '@whiteboard/core/types'
import {
  alignNodes,
  distributeNodes,
  type NodeAlignMode,
  type NodeDistributeMode,
  type NodeLayoutEntry,
  type NodeLayoutUpdate
} from '@whiteboard/core/node/layout'
import {
  getNodeBoundsByNode,
  getNodeRect
} from '@whiteboard/core/node/geometry'
import { createNodeFieldsUpdateOperation } from '@whiteboard/core/node/update'

type NodeCreateOperationResult =
  Result<{
    operation: Extract<Operation, { type: 'node.create' }>
    nodeId: NodeId
  }, 'invalid'>

type NodeOperationsResult =
  Result<{
    operations: Operation[]
  }, 'invalid'>

type BuildNodeCreateOperationInput = {
  payload: NodeInput
  doc: Document
  registries: CoreRegistries
  createNodeId: () => NodeId
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
  const nodes = documentApi.list.nodes(doc)
  const rootIds = Array.from(new Set(ids))
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

    const bounds = getNodeBoundsByNode(node, nodeSize) ?? getNodeRect(node, nodeSize)

    entries.push({
      id: node.id,
      position: node.position,
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
  const nodes = documentApi.list.nodes(doc)
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))
  const operations: Operation[] = []

  updates.forEach((update) => {
    const node = nodeById.get(update.id)
    if (!node) {
      return
    }

    operations.push(
      ...createNodeFieldsUpdateOperation(update.id, {
        position: update.position
      })
    )
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
  if (!payload.position) {
    return err('invalid', 'Missing node position.')
  }
  if (payload.id && documentApi.has.node(doc, payload.id)) {
    return err('invalid', `Node ${payload.id} already exists.`)
  }

  const typeDef = registries.nodeTypes.get(payload.type)
  if (typeDef?.validate && !typeDef.validate(payload.data)) {
    return err('invalid', `Node ${payload.type} validation failed.`)
  }

  const missing = schemaApi.node.missingFields(payload, registries)
  if (missing.length > 0) {
    return err('invalid', `Missing required fields: ${missing.join(', ')}.`)
  }

  const normalized = schemaApi.node.applyDefaults(payload, registries)
  const nextNode = normalized
  const id = nextNode.id ?? createNodeId()
  const node: Node = {
    ...nextNode,
    id
  }

  return ok({
    nodeId: id,
    operation: {
      type: 'node.create',
      node
    }
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
