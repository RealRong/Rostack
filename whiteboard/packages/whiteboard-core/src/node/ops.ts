import { schema as schemaApi } from '@whiteboard/core/registry/schema'
import { err, ok } from '@whiteboard/core/utils/result'
import type {
  CoreRegistries,
  Document,
  Node,
  NodeId,
  NodeInput,
  Operation,
  Result
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
} from '@whiteboard/core/node/geometry'
import { createNodeFieldsUpdateOperation } from '@whiteboard/core/node/update'
import { materializeCommittedNode } from '@whiteboard/core/node/materialize'

type NodeCreateOpResult =
  Result<{
    operation: Extract<Operation, { type: 'node.create' }>
    nodeId: NodeId
  }, 'invalid'>

type NodeOpsResult =
  Result<{
    operations: Operation[]
  }, 'invalid'>

type CreateNodeOpInput = {
  payload: NodeInput
  doc: Document
  registries: CoreRegistries
  createNodeId: () => NodeId
}

type NodeLayoutOpsInput = {
  ids: readonly NodeId[]
  doc: Document
}

const readLayoutEntries = ({
  ids,
  doc
}: NodeLayoutOpsInput): Result<{
  entries: NodeLayoutEntry[]
}, 'invalid'> => {
  const nodes = Object.values(doc.nodes)
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

    const bounds = getNodeBoundsByNode(node)
      ?? {
        x: node.position.x,
        y: node.position.y,
        width: node.size.width,
        height: node.size.height
      }

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

const createLayoutOps = (
  doc: Document,
  updates: readonly NodeLayoutUpdate[]
): {
  operations: Operation[]
} => {
  const nodes = Object.values(doc.nodes)
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

export const createNodeOp = ({
  payload,
  doc,
  registries,
  createNodeId
}: CreateNodeOpInput): NodeCreateOpResult => {
  if (!payload.type) {
    return err('invalid', 'Missing node type.')
  }
  if (!payload.position) {
    return err('invalid', 'Missing node position.')
  }
  if (payload.id && doc.nodes[payload.id]) {
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
  const materialized = materializeCommittedNode({
    node: normalized,
    createNodeId
  })
  if (!materialized.ok) {
    return materialized
  }

  return ok({
    nodeId: materialized.data.id,
    operation: {
      type: 'node.create',
      value: materialized.data
    }
  })
}

export const planNodeAlignOps = ({
  ids,
  doc,
  mode
}: NodeLayoutOpsInput & {
  mode: NodeAlignMode
}): NodeOpsResult => {
  const entriesResult = readLayoutEntries({
    ids,
    doc
  })
  if (!entriesResult.ok) {
    return entriesResult
  }

  const updates = alignNodes(entriesResult.data.entries, mode)
  return ok(createLayoutOps(doc, updates))
}

export const planNodeDistributeOps = ({
  ids,
  doc,
  mode
}: NodeLayoutOpsInput & {
  mode: NodeDistributeMode
}): NodeOpsResult => {
  const entriesResult = readLayoutEntries({
    ids,
    doc
  })
  if (!entriesResult.ok) {
    return entriesResult
  }

  const updates = distributeNodes(entriesResult.data.entries, mode)
  return ok(createLayoutOps(doc, updates))
}
