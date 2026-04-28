import { json } from '@shared/core'
import {
  path as draftPath,
  record as draftRecord,
  type RecordWrite
} from '@shared/draft'
import type {
  Node,
  NodeFieldPatch,
  NodeId,
  NodePatch,
  NodeUpdateInput,
  Operation
} from '@whiteboard/core/types'
import {
  createNodePatch
} from '@whiteboard/core/operations/patch'
export type NodeUpdateImpact = {
  geometry: boolean
  list: boolean
  value: boolean
}

const NODE_FIELD_KEYS: Array<keyof NodeFieldPatch> = [
  'position',
  'size',
  'rotation',
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
  'groupId',
  'owner'
])

const NODE_VALUE_KEYS = new Set<keyof NodeFieldPatch>(['locked'])

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

  if (hasOwn(fields, 'position')) {
    patch.position = json.clone(fields.position)
  }
  if (hasOwn(fields, 'size')) {
    patch.size = json.clone(fields.size)
  }
  if (hasOwn(fields, 'rotation')) {
    patch.rotation = json.clone(fields.rotation)
  }
  if (hasOwn(fields, 'groupId')) {
    patch.groupId = json.clone(fields.groupId)
  }
  if (hasOwn(fields, 'owner')) {
    patch.owner = json.clone(fields.owner)
  }
  if (hasOwn(fields, 'locked')) {
    patch.locked = json.clone(fields.locked)
  }

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

  if (hasOwn(fields, 'position')) {
    inverse.position = json.clone(node.position)
  }
  if (hasOwn(fields, 'size')) {
    inverse.size = json.clone(node.size)
  }
  if (hasOwn(fields, 'rotation')) {
    inverse.rotation = json.clone(node.rotation)
  }
  if (hasOwn(fields, 'groupId')) {
    inverse.groupId = json.clone(node.groupId)
  }
  if (hasOwn(fields, 'owner')) {
    inverse.owner = json.clone(node.owner)
  }
  if (hasOwn(fields, 'locked')) {
    inverse.locked = json.clone(node.locked)
  }

  return inverse
}

const cloneRecordWrite = (
  record?: RecordWrite
): RecordWrite | undefined => {
  if (!record || Object.keys(record).length === 0) {
    return undefined
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(record).map(([path, value]) => [path, json.clone(value)])
    )
  )
}

const hasRecordWrite = (
  record?: RecordWrite
): boolean => Boolean(record && Object.keys(record).length > 0)

const applyRecordWrite = <T,>(
  current: T,
  record?: RecordWrite
): { ok: true; value: T } | { ok: false; message: string } => {
  if (!record || Object.keys(record).length === 0) {
    return {
      ok: true,
      value: current
    }
  }

  try {
    return {
      ok: true,
      value: draftRecord.apply(current, record)
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error
        ? error.message
        : 'Failed to apply record write.'
    }
  }
}

const isDataRecordPath = (
  path: string
): boolean => path === 'data' || path.startsWith('data.')

const isStyleRecordPath = (
  path: string
): boolean => path === 'style' || path.startsWith('style.')

const readRecordScope = (
  path: string
): 'data' | 'style' | undefined => (
  isDataRecordPath(path)
    ? 'data'
    : isStyleRecordPath(path)
      ? 'style'
      : undefined
)

const createsMissingRecordAncestor = (
  node: Node,
  targetPath: string
): boolean => {
  const scope = readRecordScope(targetPath)
  if (!scope || targetPath === scope) {
    return false
  }

  let parent = draftPath.parent(targetPath)
  while (parent && parent !== scope) {
    if (!draftRecord.has(node, parent)) {
      return true
    }
    parent = draftPath.parent(parent)
  }

  return false
}

const buildRecordInverse = (
  node: Node,
  record?: RecordWrite
): RecordWrite | undefined => {
  if (!record || !Object.keys(record).length) {
    return undefined
  }

  const inverse: Record<string, unknown> = {}

  Object.keys(record)
    .sort((left, right) => draftPath.parts(left).length - draftPath.parts(right).length)
    .forEach((targetPath) => {
      const scope = readRecordScope(targetPath)
      if (scope && createsMissingRecordAncestor(node, targetPath)) {
        Object.keys(inverse).forEach((key) => {
          if (draftPath.startsWith(key, scope)) {
            delete inverse[key]
          }
        })
        inverse[scope] = json.clone(node[scope])
        return
      }

      if (Object.keys(inverse).some((existing) => draftPath.startsWith(targetPath, existing))) {
        return
      }

      inverse[targetPath] = draftRecord.has(node, targetPath)
        ? json.clone(draftRecord.read(node, targetPath))
        : undefined
    })

  return Object.freeze(inverse)
}

const mergeNodeUpdates = (
  ...updates: Array<NodeUpdateInput | undefined>
): NodeUpdateInput => {
  const fields = updates.reduce<NodeUpdateInput['fields']>(
    (current, update) => update?.fields
      ? {
          ...(current ?? {}),
          ...update.fields
        }
      : current,
    undefined
  )
  const record = updates.reduce<Record<string, unknown>>((current, update) => {
    if (!update?.record) {
      return current
    }

    Object.entries(update.record).forEach(([path, value]) => {
      current[path] = json.clone(value)
    })
    return current
  }, {})

  return {
    ...(fields ? { fields } : {}),
    ...(Object.keys(record).length
      ? {
          record: Object.freeze(record)
        }
      : {})
  }
}

export const isNodeUpdateEmpty = (update: NodeUpdateInput): boolean =>
  !update.fields
  && !hasRecordWrite(update.record)

const compactNodeUpdateInput = (
  update: NodeUpdateInput
): NodeUpdateInput => ({
  ...(update.fields ? { fields: update.fields } : {}),
  ...(hasRecordWrite(update.record)
    ? {
        record: cloneRecordWrite(update.record)
      }
    : {})
})

export const createNodeUpdateOperation = (
  id: NodeId,
  update: NodeUpdateInput
): Operation[] => {
  const compact = compactNodeUpdateInput(update)
  return isNodeUpdateEmpty(compact)
    ? []
    : [{
        type: 'node.patch',
        id,
        patch: createNodePatch({
          ...(compact.fields
            ? {
                fields: applyFieldPatch(compact.fields)
              }
            : {}),
          ...(compact.record
            ? {
                record: compact.record
              }
            : {})
        })
      }]
}

export const createNodeFieldsUpdateOperation = (
  id: NodeId,
  fields: NodeFieldPatch
): Operation[] =>
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

  if (hasRecordWrite(update.record)) {
    impact.value = true
  }

  return impact
}

export const buildNodeUpdateInverse = (
  node: Node,
  update: NodeUpdateInput
): { ok: true; update: NodeUpdateInput } | { ok: false; message: string } => {
  const fields = buildFieldInverse(node, update.fields)
  const record = buildRecordInverse(node, update.record)

  if (update.record) {
    const applied = applyRecordWrite(node, update.record)
    if (!applied.ok) {
      return applied
    }
  }

  return {
    ok: true,
    update: compactNodeUpdateInput({
      fields: Object.keys(fields).length ? fields : undefined,
      record
    })
  }
}

export const applyNodeUpdate = (
  node: Node,
  update: NodeUpdateInput
): { ok: true; patch: NodePatch; next: Node } | { ok: false; message: string } => {
  const patch = applyFieldPatch(update.fields)
  const fieldPatchedNode: Node = {
    ...node,
    ...patch
  }
  const applied = applyRecordWrite(fieldPatchedNode, update.record)
  if (!applied.ok) {
    return applied
  }
  const next = applied.value

  if (update.record && Object.keys(update.record).some(isDataRecordPath)) {
    patch.data = next.data
  }
  if (update.record && Object.keys(update.record).some(isStyleRecordPath)) {
    patch.style = next.style
  }

  return {
    ok: true,
    patch,
    next
  }
}

export {
  mergeNodeUpdates
}
