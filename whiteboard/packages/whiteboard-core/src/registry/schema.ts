import { json } from '@shared/core'
import {
  record as draftRecord,
  type Path
} from '@shared/draft'
import type {
  CoreRegistries,
  EdgeInput,
  EdgeSchema,
  EdgeTypeDefinition,
  NodeInput,
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
      if (!draftRecord.has(target.data, field.path)) {
        target.data = draftRecord.apply(target.data, {
          [field.path]: field.defaultValue
        }) as Record<string, unknown>
      }
      return
    }
    if (scope === 'style') {
      target.style = target.style ?? {}
      if (!draftRecord.has(target.style, field.path)) {
        target.style = draftRecord.apply(target.style, {
          [field.path]: field.defaultValue
        }) as Record<string, unknown>
      }
      return
    }
    target.label = target.label ?? {}
    if (!draftRecord.has(target.label, field.path)) {
      target.label = draftRecord.apply(target.label, {
        [field.path]: field.defaultValue
      }) as Record<string, unknown>
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
    type
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
  return !draftRecord.has(container, field.path)
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
  if (scope === 'style') return draftRecord.read(target.style, field.path)
  if (scope === 'label') return draftRecord.read(target.label, field.path)
  return draftRecord.read(target.data, field.path)
}

export type NodeSchemaFieldRef = Pick<SchemaField, 'path'> & {
  scope?: 'data' | 'style'
}

export const schema = {
  node: {
    applyDefaults: applyNodeDefaults,
    missingFields: getMissingNodeFields
  },
  edge: {
    applyDefaults: applyEdgeDefaults,
    missingFields: getMissingEdgeFields
  }
} as const
