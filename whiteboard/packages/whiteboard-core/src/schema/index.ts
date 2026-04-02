import type {
  CoreRegistries,
  EdgeInput,
  EdgeSchema,
  EdgeTypeDefinition,
  NodeInput,
  NodeRecordMutation,
  NodeRecordScope,
  NodeUpdateInput,
  NodeSchema,
  NodeType,
  NodeTypeDefinition,
  SchemaField
} from '../types/core'
import { cloneValue } from '../utils/merge'
import { getValueByPath, hasValueByPath, setValueByPath } from '../utils/objectPath'

type SchemaTarget = {
  data?: Record<string, unknown>
  style?: Record<string, unknown>
  label?: Record<string, unknown>
}

const cloneTarget = <T extends SchemaTarget>(input: T): T => {
  const next = { ...input }
  if (input.data) {
    next.data = cloneValue(input.data)
  }
  if (input.style) {
    next.style = cloneValue(input.style)
  }
  if ('label' in input && input.label) {
    next.label = cloneValue(input.label)
  }
  return next
}

const mergeDefaults = (target: Record<string, unknown>, defaults: Record<string, unknown>) => {
  Object.entries(defaults).forEach(([key, value]) => {
    const current = target[key]
    if (current === undefined) {
      target[key] = cloneValue(value)
      return
    }
    if (
      current
      && value
      && typeof current === 'object'
      && typeof value === 'object'
      && !Array.isArray(current)
      && !Array.isArray(value)
    ) {
      mergeDefaults(current as Record<string, unknown>, value as Record<string, unknown>)
    }
  })
}

const resolveNodeSchema = (registries: CoreRegistries, type: NodeType): NodeSchema | undefined => {
  return registries.schemas.getNode(type) ?? registries.nodeTypes.get(type)?.schema
}

const resolveEdgeSchema = (registries: CoreRegistries, type: string): EdgeSchema | undefined => {
  return registries.schemas.getEdge(type) ?? registries.edgeTypes.get(type)?.schema
}

const applyFieldDefaults = (target: SchemaTarget, fields: SchemaField[]) => {
  fields.forEach((field) => {
    if (field.defaultValue === undefined) return
    const scope = field.scope ?? 'data'
    if (scope === 'label' && !('label' in target)) return
    if (scope === 'data') {
      target.data = target.data ?? {}
      if (!hasValueByPath(target.data, field.path)) {
        setValueByPath(target.data, field.path, cloneValue(field.defaultValue))
      }
      return
    }
    if (scope === 'style') {
      target.style = target.style ?? {}
      if (!hasValueByPath(target.style, field.path)) {
        setValueByPath(target.style, field.path, cloneValue(field.defaultValue))
      }
      return
    }
    target.label = target.label ?? {}
    if (!hasValueByPath(target.label, field.path)) {
      setValueByPath(target.label, field.path, cloneValue(field.defaultValue))
    }
  })
}

export const applyNodeDefaults = (input: NodeInput, registries: CoreRegistries): NodeInput => {
  const type = input.type
  if (!type) return input
  const next = cloneTarget(input)
  const definition = registries.nodeTypes.get(type) as NodeTypeDefinition | undefined
  if (definition?.defaultData) {
    next.data = next.data ?? {}
    mergeDefaults(next.data as Record<string, unknown>, definition.defaultData)
  }
  const schema = resolveNodeSchema(registries, type)
  if (schema?.fields) {
    applyFieldDefaults(next, schema.fields)
  }
  return next
}

export const applyEdgeDefaults = (input: EdgeInput, registries: CoreRegistries): EdgeInput => {
  const type = input.type ?? 'linear'
  const next = cloneTarget({
    ...input,
    type,
    route: input.route ?? { kind: 'auto' as const }
  }) as EdgeInput
  const definition = registries.edgeTypes.get(type) as EdgeTypeDefinition | undefined
  if (definition?.defaultData) {
    next.data = next.data ?? {}
    mergeDefaults(next.data as Record<string, unknown>, definition.defaultData)
  }
  const schema = resolveEdgeSchema(registries, type)
  if (schema?.fields) {
    applyFieldDefaults(next, schema.fields)
  }
  return next
}

const isMissingRequired = (container: unknown, field: SchemaField) => {
  if (!field.required) return false
  if (field.defaultValue !== undefined) return false
  if (!container) return true
  return !hasValueByPath(container, field.path)
}

export const getMissingNodeFields = (input: NodeInput, registries: CoreRegistries): string[] => {
  const type = input.type
  if (!type) return ['type']
  const schema = resolveNodeSchema(registries, type)
  if (!schema?.fields?.length) return []
  const missing: string[] = []
  schema.fields.forEach((field) => {
    const scope = field.scope ?? 'data'
    if (scope === 'style') {
      if (isMissingRequired(input.style, field)) missing.push(field.id)
      return
    }
    if (scope === 'label') {
      if (isMissingRequired((input as SchemaTarget).label, field)) missing.push(field.id)
      return
    }
    if (isMissingRequired(input.data, field)) missing.push(field.id)
  })
  return missing
}

export const getMissingEdgeFields = (input: EdgeInput, registries: CoreRegistries): string[] => {
  const type = input.type ?? 'linear'
  const schema = resolveEdgeSchema(registries, type)
  if (!schema?.fields?.length) return []
  const missing: string[] = []
  schema.fields.forEach((field) => {
    const scope = field.scope ?? 'data'
    if (scope === 'style') {
      if (isMissingRequired(input.style, field)) missing.push(field.id)
      return
    }
    if (scope === 'label') {
      if (isMissingRequired(input.label, field)) missing.push(field.id)
      return
    }
    if (isMissingRequired(input.data, field)) missing.push(field.id)
  })
  return missing
}

const getSchemaFieldValue = (target: SchemaTarget, field: SchemaField): unknown => {
  const scope = field.scope ?? 'data'
  if (scope === 'style') return getValueByPath(target.style, field.path)
  if (scope === 'label') return getValueByPath(target.label, field.path)
  return getValueByPath(target.data, field.path)
}

export type NodeSchemaFieldRef = Pick<SchemaField, 'path'> & {
  scope?: NodeRecordScope
}

const toNodeRecordPath = (
  path: string
): string | undefined => {
  const normalized = path.trim()
  return normalized ? normalized : undefined
}

export const compileNodeFieldRecord = (
  field: NodeSchemaFieldRef,
  value: unknown
): NodeRecordMutation | undefined => {
  const scope = field.scope ?? 'data'
  const path = toNodeRecordPath(field.path)

  if (value === undefined) {
    if (!path) {
      return undefined
    }
    return {
      scope,
      op: 'unset',
      path
    }
  }

  return {
    scope,
    op: 'set',
    ...(path ? { path } : {}),
    value: cloneValue(value)
  }
}

export const compileNodeFieldUpdate = (
  field: NodeSchemaFieldRef,
  value: unknown
): NodeUpdateInput => {
  const record = compileNodeFieldRecord(field, value)
  return record
    ? { records: [record] }
    : {}
}

export const compileNodeFieldUpdates = (
  entries: ReadonlyArray<{
    field: NodeSchemaFieldRef
    value: unknown
  }>
): NodeUpdateInput => {
  const records = entries.flatMap((entry) => {
    const record = compileNodeFieldRecord(entry.field, entry.value)
    return record ? [record] : []
  })

  return records.length > 0
    ? { records }
    : {}
}
