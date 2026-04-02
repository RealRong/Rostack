import type {
  Document,
  Edge,
  Node,
  NodeFieldPatch,
  NodeRecordMutation,
  NodeRecordScope,
  NodeUpdateInput,
  Operation
} from '@whiteboard/core/types'
import * as Y from 'yjs'
import {
  appendUniqueToYArray,
  ensureCollabDocumentMap,
  ensureYArrayEntry,
  ensureYMapEntry,
  hasOwn,
  removeFromYArray,
  replaceYArrayValues,
  replaceYMapEntry,
  toYValue,
  writeSchemaVersion
} from './shared'

const NODE_FIELD_KEYS: Array<keyof NodeFieldPatch> = [
  'position',
  'size',
  'rotation',
  'layer',
  'zIndex',
  'children',
  'locked'
]

const ensureCollectionMaps = (
  documentMap: Y.Map<unknown>,
  key: 'nodes' | 'edges'
) => {
  const collection = ensureYMapEntry(documentMap, key)
  return {
    entities: ensureYMapEntry(collection, 'entities'),
    order: ensureYArrayEntry(collection, 'order')
  }
}

const createYNode = (
  node: Node
): Y.Map<unknown> => toYValue(node) as Y.Map<unknown>

const createYEdge = (
  edge: Edge
): Y.Map<unknown> => toYValue(edge) as Y.Map<unknown>

type EdgeUpdatePatch = Extract<Operation, { type: 'edge.update' }>['patch']

const resolveRecordRoot = (
  nodeMap: Y.Map<unknown>,
  scope: NodeRecordScope,
  createMissing: boolean
): Y.Map<unknown> | undefined => {
  const key = scope
  const current = nodeMap.get(key)
  if (current instanceof Y.Map) {
    return current
  }
  if (current === undefined) {
    if (!createMissing) {
      return undefined
    }
    const next = new Y.Map<unknown>()
    nodeMap.set(key, next)
    return next
  }

  throw new Error(`Node ${String(nodeMap.get('id'))}.${key} is not a map container.`)
}

const resolvePathParent = (
  root: Y.Map<unknown>,
  path: string,
  createMissing: boolean
): { parent: Y.Map<unknown>; key: string } => {
  const parts = path.split('.').filter(Boolean)
  if (!parts.length) {
    throw new Error('Path is required.')
  }

  let current = root
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!
    const next = current.get(part)
    if (next instanceof Y.Map) {
      current = next
      continue
    }
    if (next === undefined && createMissing) {
      const created = new Y.Map<unknown>()
      current.set(part, created)
      current = created
      continue
    }

    throw new Error(`Cannot resolve path "${path}" through a non-map container.`)
  }

  return {
    parent: current,
    key: parts[parts.length - 1]!
  }
}

const resolveArrayAtPath = (
  root: Y.Map<unknown>,
  path: string
): Y.Array<unknown> => {
  const parts = path.split('.').filter(Boolean)
  if (!parts.length) {
    throw new Error('Splice path is required.')
  }

  let current: unknown = root
  for (const part of parts) {
    if (!(current instanceof Y.Map)) {
      throw new Error(`Cannot resolve array path "${path}".`)
    }
    current = current.get(part)
  }

  if (!(current instanceof Y.Array)) {
    throw new Error(`Path "${path}" is not an array.`)
  }

  return current
}

const applyRecordMutationToYNode = (
  nodeMap: Y.Map<unknown>,
  mutation: NodeRecordMutation
) => {
  if (mutation.op === 'set' && !mutation.path) {
    replaceYMapEntry(nodeMap, mutation.scope, mutation.value)
    return
  }

  const root = resolveRecordRoot(
    nodeMap,
    mutation.scope,
    mutation.op === 'set'
  )

  if (!root) {
    if (mutation.op === 'unset') {
      return
    }
    throw new Error(`Missing ${mutation.scope} root for mutation.`)
  }

  if (mutation.op === 'set') {
    if (mutation.value === undefined) {
      throw new Error(`Cannot set undefined value at path "${mutation.path}".`)
    }
    const target = resolvePathParent(root, mutation.path!, true)
    target.parent.set(target.key, toYValue(mutation.value))
    return
  }

  if (mutation.op === 'unset') {
    const target = resolvePathParent(root, mutation.path, false)
    target.parent.delete(target.key)
    return
  }

  const target = resolveArrayAtPath(root, mutation.path)
  target.delete(mutation.index, mutation.deleteCount)
  if (mutation.values?.length) {
    target.insert(
      mutation.index,
      mutation.values.map((entry) => toYValue(entry))
    )
  }
}

const applyNodeUpdateToYNode = (
  nodeMap: Y.Map<unknown>,
  update: NodeUpdateInput
) => {
  const fields = update.fields
  if (fields) {
    NODE_FIELD_KEYS.forEach((key) => {
      if (!hasOwn(fields, key)) {
        return
      }

      const value = fields[key]
      if (key === 'children') {
        if (value === undefined) {
          nodeMap.delete('children')
          return
        }
        const children = ensureYArrayEntry(nodeMap, 'children')
        replaceYArrayValues(children, value as readonly unknown[])
        return
      }

      replaceYMapEntry(nodeMap, key, value)
    })
  }

  update.records?.forEach((mutation) => {
    applyRecordMutationToYNode(nodeMap, mutation)
  })
}

const applyEdgePatchToYEdge = (
  edgeMap: Y.Map<unknown>,
  patch: EdgeUpdatePatch
) => {
  const keys = Object.keys(patch) as string[]
  keys.forEach((key) => {
    replaceYMapEntry(
      edgeMap,
      key,
      (patch as Record<string, unknown>)[key]
    )
  })
}

export const applyOperationsToYjsDocument = ({
  doc,
  operations,
  snapshot
}: {
  doc: Y.Doc
  operations: readonly Operation[]
  snapshot?: Document
}) => {
  const documentMap = ensureCollabDocumentMap(doc)
  const nodes = ensureCollectionMaps(documentMap, 'nodes')
  const edges = ensureCollectionMaps(documentMap, 'edges')

  operations.forEach((operation) => {
    switch (operation.type) {
      case 'document.update':
        replaceYMapEntry(documentMap, 'background', operation.patch.background)
        return
      case 'node.create':
        nodes.entities.set(operation.node.id, createYNode(operation.node))
        appendUniqueToYArray(nodes.order, operation.node.id)
        return
      case 'node.update': {
        const current = nodes.entities.get(operation.id)
        if (!(current instanceof Y.Map)) {
          throw new Error(`Cannot update missing node ${operation.id}.`)
        }
        applyNodeUpdateToYNode(current, operation.update)
        return
      }
      case 'node.delete':
        nodes.entities.delete(operation.id)
        removeFromYArray(nodes.order, operation.id)
        return
      case 'node.order.set':
        replaceYArrayValues(nodes.order, operation.ids)
        return
      case 'edge.create':
        edges.entities.set(operation.edge.id, createYEdge(operation.edge))
        appendUniqueToYArray(edges.order, operation.edge.id)
        return
      case 'edge.update': {
        const current = edges.entities.get(operation.id)
        if (!(current instanceof Y.Map)) {
          throw new Error(`Cannot update missing edge ${operation.id}.`)
        }
        applyEdgePatchToYEdge(current, operation.patch)
        return
      }
      case 'edge.delete':
        edges.entities.delete(operation.id)
        removeFromYArray(edges.order, operation.id)
        return
      case 'edge.order.set':
        replaceYArrayValues(edges.order, operation.ids)
        return
    }
  })
  if (snapshot) {
    replaceYMapEntry(documentMap, 'id', snapshot.id)
    replaceYMapEntry(documentMap, 'name', snapshot.name)
  }

  writeSchemaVersion(doc)
}
