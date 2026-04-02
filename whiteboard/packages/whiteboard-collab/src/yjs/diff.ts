import { createNodeUpdateOperation } from '@whiteboard/core/node'
import type {
  Document,
  Edge,
  EdgePatch,
  Node,
  NodeFieldPatch,
  NodeRecordMutation,
  NodeRecordScope,
  NodeUpdateInput,
  Operation
} from '@whiteboard/core/types'
import { assertDocument } from '@whiteboard/core/types'
import type { RemoteDocumentChange } from '../types/internal'
import {
  cloneJsonValue,
  hasOwn,
  isDeepEqual,
  isPlainObject
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

const joinPath = (
  base: string | undefined,
  key: string
) => base ? `${base}.${key}` : key

const diffRecordScope = (
  scope: NodeRecordScope,
  beforeValue: unknown,
  afterValue: unknown,
  path?: string
): NodeRecordMutation[] => {
  if (isDeepEqual(beforeValue, afterValue)) {
    return []
  }

  if (!path) {
    if (
      beforeValue === undefined
      || afterValue === undefined
      || !isPlainObject(beforeValue)
      || !isPlainObject(afterValue)
    ) {
      return [{
        scope,
        op: 'set',
        value: cloneJsonValue(afterValue)
      }]
    }
  }

  if (afterValue === undefined) {
    if (!path) {
      return [{
        scope,
        op: 'set',
        value: undefined
      }]
    }
    return [{
      scope,
      op: 'unset',
      path
    }]
  }

  if (beforeValue === undefined) {
    if (!path) {
      return [{
        scope,
        op: 'set',
        value: cloneJsonValue(afterValue)
      }]
    }
    return [{
      scope,
      op: 'set',
      path,
      value: cloneJsonValue(afterValue)
    }]
  }

  if (
    scope === 'data'
    && path
    && Array.isArray(beforeValue)
    && Array.isArray(afterValue)
  ) {
    return [{
      scope,
      op: 'splice',
      path,
      index: 0,
      deleteCount: beforeValue.length,
      ...(afterValue.length > 0
        ? { values: cloneJsonValue(afterValue) as readonly unknown[] }
        : {})
    }]
  }

  if (isPlainObject(beforeValue) && isPlainObject(afterValue)) {
    const keys = new Set([
      ...Object.keys(beforeValue),
      ...Object.keys(afterValue)
    ])
    const operations: NodeRecordMutation[] = []

    Array.from(keys).sort().forEach((key) => {
      operations.push(...diffRecordScope(
        scope,
        beforeValue[key],
        afterValue[key],
        joinPath(path, key)
      ))
    })

    return operations
  }

  if (!path) {
    return [{
      scope,
      op: 'set',
      value: cloneJsonValue(afterValue)
    }]
  }

  return [{
    scope,
    op: 'set',
    path,
    value: cloneJsonValue(afterValue)
  }]
}

const diffNodeFields = (
  before: Node,
  after: Node
): NodeFieldPatch | undefined => {
  const fields: NodeFieldPatch = {}

  NODE_FIELD_KEYS.forEach((key) => {
    if (!isDeepEqual((before as any)[key], (after as any)[key])) {
      ;(fields as any)[key] = cloneJsonValue((after as any)[key])
    }
  })

  return Object.keys(fields).length > 0
    ? fields
    : undefined
}

const diffNodeUpdate = (
  before: Node,
  after: Node
): NodeUpdateInput | undefined => {
  if (before.type !== after.type) {
    return undefined
  }

  const fields = diffNodeFields(before, after)
  const records = [
    ...diffRecordScope('data', before.data, after.data),
    ...diffRecordScope('style', before.style, after.style)
  ]

  if (!fields && records.length === 0) {
    return undefined
  }

  return {
    ...(fields ? { fields } : {}),
    ...(records.length > 0 ? { records } : {})
  }
}

const diffEdgePatch = (
  before: Edge,
  after: Edge
): EdgePatch | undefined => {
  const patch: EdgePatch = {}

  ;([
    'source',
    'target',
    'type',
    'route',
    'style',
    'label',
    'data'
  ] as const).forEach((key) => {
    if (!isDeepEqual(before[key], after[key])) {
      ;(patch as any)[key] = cloneJsonValue(after[key])
    }
  })

  return Object.keys(patch).length > 0
    ? patch
    : undefined
}

const diffEntityOrder = <T extends string>(
  beforeOrder: readonly T[],
  afterOrder: readonly T[]
) => !isDeepEqual(beforeOrder, afterOrder)

export const compileRemoteDocumentChange = (
  beforeDocument: Document,
  afterDocument: Document
): RemoteDocumentChange => {
  const before = assertDocument(beforeDocument)
  const after = assertDocument(afterDocument)

  if (
    before.id !== after.id
    || before.name !== after.name
  ) {
    return {
      kind: 'replace',
      document: cloneJsonValue(after)
    }
  }

  const operations: Operation[] = []

  if (!isDeepEqual(before.background, after.background)) {
    operations.push({
      type: 'document.update',
      patch: {
        background: cloneJsonValue(after.background)
      }
    })
  }

  const nodeIds = new Set([
    ...Object.keys(before.nodes.entities),
    ...Object.keys(after.nodes.entities)
  ])

  Array.from(nodeIds).sort().forEach((id) => {
    const previous = before.nodes.entities[id]
    const next = after.nodes.entities[id]

    if (!previous && next) {
      operations.push({
        type: 'node.create',
        node: cloneJsonValue(next)
      })
      return
    }

    if (previous && !next) {
      operations.push({
        type: 'node.delete',
        id
      })
      return
    }

    if (!previous || !next) {
      return
    }

    if (previous.type !== next.type) {
      operations.push({
        type: 'node.delete',
        id
      })
      operations.push({
        type: 'node.create',
        node: cloneJsonValue(next)
      })
      return
    }

    const update = diffNodeUpdate(previous, next)
    if (update) {
      operations.push(createNodeUpdateOperation(id, update))
    }
  })

  if (diffEntityOrder(before.nodes.order, after.nodes.order)) {
    operations.push({
      type: 'node.order.set',
      ids: cloneJsonValue(after.nodes.order)
    })
  }

  const edgeIds = new Set([
    ...Object.keys(before.edges.entities),
    ...Object.keys(after.edges.entities)
  ])

  Array.from(edgeIds).sort().forEach((id) => {
    const previous = before.edges.entities[id]
    const next = after.edges.entities[id]

    if (!previous && next) {
      operations.push({
        type: 'edge.create',
        edge: cloneJsonValue(next)
      })
      return
    }

    if (previous && !next) {
      operations.push({
        type: 'edge.delete',
        id
      })
      return
    }

    if (!previous || !next) {
      return
    }

    const patch = diffEdgePatch(previous, next)
    if (patch) {
      operations.push({
        type: 'edge.update',
        id,
        patch
      })
    }
  })

  if (diffEntityOrder(before.edges.order, after.edges.order)) {
    operations.push({
      type: 'edge.order.set',
      ids: cloneJsonValue(after.edges.order)
    })
  }

  return {
    kind: 'operations',
    operations
  }
}
