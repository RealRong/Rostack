import type {
  Node,
  NodeFieldPatch,
  NodeId,
  NodePatch,
  NodeRecordMutation,
  NodeUpdateInput,
  Operation
} from '@whiteboard/core/types'
import {
  applyPathMutation,
  isObjectContainer
} from '@whiteboard/core/utils/recordMutation'
import { getValueByPath } from '@whiteboard/core/utils/objectPath'
import { cloneValue } from '@whiteboard/core/value'

export type NodeUpdateImpact = {
  geometry: boolean
  list: boolean
  value: boolean
}

const NODE_FIELD_KEYS: Array<keyof NodeFieldPatch> = [
  'position',
  'size',
  'rotation',
  'layer',
  'zIndex',
  'groupId',
  'owner',
  'locked'
]

const NODE_GEOMETRY_KEYS = new Set<keyof NodeFieldPatch>([
  'position',
  'size',
  'rotation'
])

const NODE_LIST_KEYS = new Set<keyof NodeFieldPatch>([
  'layer',
  'zIndex',
  'groupId',
  'owner'
])

const NODE_VALUE_KEYS = new Set<keyof NodeFieldPatch>([
  'locked'
])

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

const applyFieldPatch = (
  fields?: NodeFieldPatch
): NodePatch => {
  const patch: NodePatch = {}
  if (!fields) {
    return patch
  }

  NODE_FIELD_KEYS.forEach((key) => {
    if (!hasOwn(fields, key)) {
      return
    }
    ;(patch as any)[key] = cloneValue(fields[key])
  })

  return patch
}

const buildFieldInverse = (
  node: Node,
  fields?: NodeFieldPatch
): NodeFieldPatch => {
  const inverse: NodeFieldPatch = {}
  if (!fields) {
    return inverse
  }

  NODE_FIELD_KEYS.forEach((key) => {
    if (!hasOwn(fields, key)) {
      return
    }
    ;(inverse as any)[key] = cloneValue((node as any)[key])
  })

  return inverse
}

const applyRecordMutation = (
  current: unknown,
  mutation: NodeRecordMutation
): { ok: true; value: unknown } | { ok: false; message: string } => {
  return applyPathMutation(current, mutation)
}

const inspectRecordPath = (
  current: unknown,
  path: string
): {
  canAddressPath: boolean
  exists: boolean
  value: unknown
  parentIsArray: boolean
} => {
  const parts = path.split('.').filter(Boolean)
  if (!parts.length) {
    return {
      canAddressPath: false,
      exists: false,
      value: undefined,
      parentIsArray: false
    }
  }
  if (!isObjectContainer(current)) {
    return {
      canAddressPath: false,
      exists: false,
      value: undefined,
      parentIsArray: false
    }
  }

  let container: any = current
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    if (!hasOwn(container, part)) {
      return {
        canAddressPath: false,
        exists: false,
        value: undefined,
        parentIsArray: false
      }
    }

    const nextValue = container[part]
    if (!isObjectContainer(nextValue)) {
      return {
        canAddressPath: false,
        exists: false,
        value: undefined,
        parentIsArray: false
      }
    }

    container = nextValue
  }

  const key = parts[parts.length - 1]
  const exists = hasOwn(container, key)
  return {
    canAddressPath: true,
    exists,
    value: exists ? container[key] : undefined,
    parentIsArray: Array.isArray(container)
  }
}

const buildSetRecordInverse = (
  current: unknown,
  mutation: Extract<NodeRecordMutation, { op: 'set' }>
): NodeRecordMutation => {
  if (!mutation.path) {
    return {
      scope: mutation.scope,
      op: 'set',
      value: cloneValue(current)
    }
  }

  const inspected = inspectRecordPath(current, mutation.path)
  if (!inspected.canAddressPath || (inspected.parentIsArray && !inspected.exists)) {
    return {
      scope: mutation.scope,
      op: 'set',
      value: cloneValue(current)
    }
  }

  if (inspected.exists) {
    return {
      scope: mutation.scope,
      op: 'set',
      path: mutation.path,
      value: cloneValue(inspected.value)
    }
  }

  return {
    scope: mutation.scope,
    op: 'unset',
    path: mutation.path
  }
}

const buildUnsetRecordInverse = (
  current: unknown,
  mutation: Extract<NodeRecordMutation, { op: 'unset' }>
): { ok: true; record: NodeRecordMutation } | { ok: false; message: string } => {
  const inspected = inspectRecordPath(current, mutation.path)
  if (!inspected.canAddressPath || !inspected.exists) {
    return {
      ok: false,
      message: `Path "${mutation.path}" does not exist.`
    }
  }

  return {
    ok: true,
    record: {
      scope: mutation.scope,
      op: 'set',
      path: mutation.path,
      value: cloneValue(inspected.value)
    }
  }
}

const buildSpliceRecordInverse = (
  current: unknown,
  mutation: Extract<NodeRecordMutation, { op: 'splice' }>
): { ok: true; record: NodeRecordMutation } | { ok: false; message: string } => {
  const target = getValueByPath(current, mutation.path)
  if (!Array.isArray(target)) {
    return {
      ok: false,
      message: `Path "${mutation.path}" is not an array.`
    }
  }

  const removed = target.slice(
    mutation.index,
    mutation.index + mutation.deleteCount
  )

  return {
    ok: true,
    record: {
      scope: mutation.scope,
      op: 'splice',
      path: mutation.path,
      index: mutation.index,
      deleteCount: mutation.values?.length ?? 0,
      values: cloneValue(removed)
    }
  }
}

const buildRecordInverse = (
  current: unknown,
  mutation: NodeRecordMutation
): { ok: true; record: NodeRecordMutation } | { ok: false; message: string } => {
  if (mutation.op === 'set') {
    return {
      ok: true,
      record: buildSetRecordInverse(current, mutation)
    }
  }
  if (mutation.op === 'unset') {
    return buildUnsetRecordInverse(current, mutation)
  }
  return buildSpliceRecordInverse(current, mutation)
}

export const isNodeUpdateEmpty = (update: NodeUpdateInput): boolean =>
  !update.fields
  && (!(update.records?.length))

const compactNodeUpdateInput = (
  update: NodeUpdateInput
): NodeUpdateInput => ({
  ...(update.fields ? { fields: update.fields } : {}),
  ...(update.records?.length ? { records: update.records } : {})
})

export const createNodeUpdateOperation = (
  id: NodeId,
  update: NodeUpdateInput
): Extract<Operation, { type: 'node.patch' }> => {
  const compact = compactNodeUpdateInput(update)
  const applied = applyNodeUpdate({
    id,
    type: 'text',
    position: { x: 0, y: 0 }
  }, compact)
  return {
    type: 'node.patch',
    id,
    patch: applied.ok ? applied.patch : applyFieldPatch(compact.fields)
  }
}

export const createNodeFieldsUpdateOperation = (
  id: NodeId,
  fields: NodeFieldPatch
): Extract<Operation, { type: 'node.patch' }> =>
  createNodeUpdateOperation(id, { fields })

export const classifyNodeUpdate = (
  update: NodeUpdateInput
): NodeUpdateImpact => {
  const impact: NodeUpdateImpact = {
    geometry: false,
    list: false,
    value: false
  }

  for (const key of NODE_FIELD_KEYS) {
    if (!update.fields || !hasOwn(update.fields, key)) {
      continue
    }
    if (NODE_GEOMETRY_KEYS.has(key)) {
      impact.geometry = true
      continue
    }
    if (NODE_LIST_KEYS.has(key)) {
      impact.list = true
      continue
    }
    if (NODE_VALUE_KEYS.has(key)) {
      impact.value = true
    }
  }

  for (const record of update.records ?? []) {
    impact.value = true
  }

  return impact
}

export const buildNodeUpdateInverse = (
  node: Node,
  update: NodeUpdateInput
): { ok: true; update: NodeUpdateInput } | { ok: false; message: string } => {
  const fields = buildFieldInverse(node, update.fields)
  const records: NodeRecordMutation[] = []
  let nextData = node.data
  let nextStyle = node.style

  for (const record of update.records ?? []) {
    const currentRoot = record.scope === 'data'
      ? nextData
      : nextStyle
    const inverse = buildRecordInverse(currentRoot, record)
    if (!inverse.ok) {
      return inverse
    }

    const applied = applyRecordMutation(currentRoot, record)
    if (!applied.ok) {
      return applied
    }

    records.unshift(inverse.record)
    if (record.scope === 'data') {
      nextData = applied.value as Node['data']
    } else {
      nextStyle = applied.value as Node['style']
    }
  }

  return {
    ok: true,
    update: compactNodeUpdateInput({
      fields: Object.keys(fields).length ? fields : undefined,
      records: records.length ? records : undefined
    })
  }
}

export const applyNodeUpdate = (
  node: Node,
  update: NodeUpdateInput
): { ok: true; patch: NodePatch; next: Node } | { ok: false; message: string } => {
  const patch = applyFieldPatch(update.fields)
  let nextData = node.data
  let nextStyle = node.style
  let touchedData = false
  let touchedStyle = false

  for (const mutation of update.records ?? []) {
    if (mutation.scope === 'style') {
      const result = applyRecordMutation(nextStyle, mutation)
      if (!result.ok) return result
      nextStyle = result.value as Node['style']
      touchedStyle = true
      continue
    }

    const result = applyRecordMutation(nextData, mutation)
    if (!result.ok) return result
    nextData = result.value as Node['data']
    touchedData = true
  }

  if (touchedData) {
    patch.data = nextData as Node['data']
  }
  if (touchedStyle) {
    patch.style = nextStyle as Node['style']
  }

  return {
    ok: true,
    patch,
    next: {
      ...node,
      ...patch
    }
  }
}
