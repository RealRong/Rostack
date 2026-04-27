import { json } from '@shared/core'
import {
  path as mutationPath,
  record as mutationRecord,
  type Path,
  type PathKey
} from '@shared/mutation'
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
} from '@whiteboard/core/types'
import { resolveNodeBootstrapSize } from '@whiteboard/core/node/bootstrap'

type SchemaTarget = {
  data?: Record<string, unknown>
  style?: Record<string, unknown>
  label?: Record<string, unknown>
}

const cloneTarget = <T extends SchemaTarget>(input: T): T => {
  const next = { ...input }
  if (input.data) {
    next.data = json.clone(input.data)
  }
  if (input.style) {
    next.style = json.clone(input.style)
  }
  if ('label' in input && input.label) {
    next.label = json.clone(input.label)
  }
  return next
}

const mergeDefaults = (target: Record<string, unknown>, defaults: Record<string, unknown>) => {
  Object.entries(defaults).forEach(([key, value]) => {
    const current = target[key]
    if (current === undefined) {
      target[key] = json.clone(value)
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
      if (!mutationRecord.has(target.data, field.path)) {
        const result = mutationRecord.apply(target.data, {
          op: 'set',
          path: field.path,
          value: field.defaultValue
        })
        if (!result.ok) {
          throw new Error(result.message)
        }
        target.data = result.value as Record<string, unknown>
      }
      return
    }
    if (scope === 'style') {
      target.style = target.style ?? {}
      if (!mutationRecord.has(target.style, field.path)) {
        const result = mutationRecord.apply(target.style, {
          op: 'set',
          path: field.path,
          value: field.defaultValue
        })
        if (!result.ok) {
          throw new Error(result.message)
        }
        target.style = result.value as Record<string, unknown>
      }
      return
    }
    target.label = target.label ?? {}
    if (!mutationRecord.has(target.label, field.path)) {
      const result = mutationRecord.apply(target.label, {
        op: 'set',
        path: field.path,
        value: field.defaultValue
      })
      if (!result.ok) {
        throw new Error(result.message)
      }
      target.label = result.value as Record<string, unknown>
    }
  })
}

const applyNodeDefaults = (input: NodeInput, registries: CoreRegistries): NodeInput => {
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
  const bootstrapSize = type === 'text'
    ? undefined
    : resolveNodeBootstrapSize(next)
  if (bootstrapSize) {
    next.size = bootstrapSize
  }
  return next
}

const applyEdgeDefaults = (input: EdgeInput, registries: CoreRegistries): EdgeInput => {
  const type = input.type ?? 'straight'
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
  return !mutationRecord.has(container, field.path)
}

const getMissingNodeFields = (input: NodeInput, registries: CoreRegistries): string[] => {
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

const getMissingEdgeFields = (input: EdgeInput, registries: CoreRegistries): string[] => {
  const type = input.type ?? 'straight'
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
      return
    }
    if (isMissingRequired(input.data, field)) missing.push(field.id)
  })
  return missing
}

const getSchemaFieldValue = (target: SchemaTarget, field: SchemaField): unknown => {
  const scope = field.scope ?? 'data'
  if (scope === 'style') return mutationRecord.read(target.style, field.path)
  if (scope === 'label') return mutationRecord.read(target.label, field.path)
  return mutationRecord.read(target.data, field.path)
}

export type NodeSchemaFieldRef = Pick<SchemaField, 'path'> & {
  scope?: NodeRecordScope
}

const toNodeRecordPath = (
  path: Path
): Path | undefined => path.length
  ? path
  : undefined

const normalizeRecordPath = (
  path: Path | PathKey
): Path => (
  typeof path === 'string' || typeof path === 'number'
    ? mutationPath.of(path)
    : path
)

const compileNodeFieldRecord = (
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
    value: json.clone(value)
  }
}

const compileNodeFieldUpdate = (
  field: NodeSchemaFieldRef,
  value: unknown
): NodeUpdateInput => {
  const record = compileNodeFieldRecord(field, value)
  return record
    ? { records: [record] }
    : {}
}

const compileNodeFieldUpdates = (
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

const compileNodeDataUpdate = (
  path: Path | PathKey,
  value: unknown
): NodeUpdateInput => compileNodeFieldUpdate(
  {
    scope: 'data',
    path: normalizeRecordPath(path)
  },
  value
)

const compileNodeStyleUpdate = (
  path: Path | PathKey,
  value: unknown
): NodeUpdateInput => compileNodeFieldUpdate(
  {
    scope: 'style',
    path: normalizeRecordPath(path)
  },
  value
)

const mergeNodeUpdates = (
  ...updates: Array<NodeUpdateInput | undefined>
): NodeUpdateInput => {
  const fields = updates.reduce<NodeUpdateInput['fields']>(
    (current, update) => {
      if (!update?.fields) {
        return current
      }

      return {
        ...(current ?? {}),
        ...update.fields
      }
    },
    undefined
  )
  const records = updates.flatMap((update) => update?.records ?? [])

  return {
    ...(fields ? { fields } : {}),
    ...(records.length ? { records } : {})
  }
}

export const schema = {
  node: {
    applyDefaults: applyNodeDefaults,
    missingFields: getMissingNodeFields,
    compileFieldRecord: compileNodeFieldRecord,
    compileFieldUpdate: compileNodeFieldUpdate,
    compileFieldUpdates: compileNodeFieldUpdates,
    compileDataUpdate: compileNodeDataUpdate,
    compileStyleUpdate: compileNodeStyleUpdate,
    mergeUpdates: mergeNodeUpdates
  },
  edge: {
    applyDefaults: applyEdgeDefaults,
    missingFields: getMissingEdgeFields
  }
} as const
