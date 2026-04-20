import type {
  Edge,
  Group,
  Node,
  Operation
} from '@whiteboard/core/types'
import { applyPathMutation } from '@whiteboard/core/utils/recordMutation'
import { cloneValue } from '@whiteboard/core/value'

export const readRecordPathValue = (
  root: unknown,
  path: string
): unknown => {
  if (!path) {
    return root
  }
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)[key]
      : undefined
  ), root)
}

export const applyNodeFieldSet = (
  node: Node,
  operation: Extract<Operation, { type: 'node.field.set' }>
): Node => ({
  ...node,
  [operation.field]: cloneValue(operation.value) as never
})

export const applyNodeFieldUnset = (
  node: Node,
  operation: Extract<Operation, { type: 'node.field.unset' }>
): Node => {
  const next = { ...node } as Node & Record<string, unknown>
  delete next[operation.field]
  return next
}

export const applyNodeRecordOperation = (
  node: Node,
  operation: Extract<Operation, { type: 'node.record.set' | 'node.record.unset' }>
): { ok: true; node: Node } | { ok: false; message: string } => {
  const current = operation.scope === 'data'
    ? node.data
    : node.style
  const result = applyPathMutation(current, operation.type === 'node.record.set'
    ? {
        op: 'set',
        path: operation.path,
        value: operation.value
      }
    : {
        op: 'unset',
        path: operation.path
      })
  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    node: {
      ...node,
      ...(operation.scope === 'data'
        ? { data: result.value as Node['data'] }
        : { style: result.value as Node['style'] })
    }
  }
}

export const applyEdgeFieldSet = (
  edge: Edge,
  operation: Extract<Operation, { type: 'edge.field.set' }>
): Edge => ({
  ...edge,
  [operation.field]: cloneValue(operation.value) as never
})

export const applyEdgeFieldUnset = (
  edge: Edge,
  operation: Extract<Operation, { type: 'edge.field.unset' }>
): Edge => {
  const next = { ...edge } as Edge & Record<string, unknown>
  delete next[operation.field]
  return next
}

export const applyEdgeRecordOperation = (
  edge: Edge,
  operation: Extract<Operation, { type: 'edge.record.set' | 'edge.record.unset' }>
): { ok: true; edge: Edge } | { ok: false; message: string } => {
  const current = operation.scope === 'data'
    ? edge.data
    : edge.style
  const result = applyPathMutation(current, operation.type === 'edge.record.set'
    ? {
        op: 'set',
        path: operation.path,
        value: operation.value
      }
    : {
        op: 'unset',
        path: operation.path
      })
  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    edge: {
      ...edge,
      ...(operation.scope === 'data'
        ? { data: result.value as Edge['data'] }
        : { style: result.value as Edge['style'] })
    }
  }
}

export const applyGroupFieldSet = (
  group: Group,
  operation: Extract<Operation, { type: 'group.field.set' }>
): Group => ({
  ...group,
  [operation.field]: cloneValue(operation.value) as never
})

export const applyGroupFieldUnset = (
  group: Group,
  operation: Extract<Operation, { type: 'group.field.unset' }>
): Group => {
  const next = { ...group } as Group & Record<string, unknown>
  delete next[operation.field]
  return next
}

export const applyMindmapTopicFieldSet = (
  node: Node,
  operation: Extract<Operation, { type: 'mindmap.topic.field.set' }>
): Node => ({
  ...node,
  [operation.field]: cloneValue(operation.value) as never
})

export const applyMindmapTopicFieldUnset = (
  node: Node,
  operation: Extract<Operation, { type: 'mindmap.topic.field.unset' }>
): Node => {
  const next = { ...node } as Node & Record<string, unknown>
  delete next[operation.field]
  return next
}

export const applyMindmapTopicRecordOperation = (
  node: Node,
  operation: Extract<Operation, { type: 'mindmap.topic.record.set' | 'mindmap.topic.record.unset' }>
): { ok: true; node: Node } | { ok: false; message: string } => {
  const current = operation.scope === 'data'
    ? node.data
    : node.style
  const result = applyPathMutation(current, operation.type === 'mindmap.topic.record.set'
    ? {
        op: 'set',
        path: operation.path,
        value: operation.value
      }
    : {
        op: 'unset',
        path: operation.path
      })
  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    node: {
      ...node,
      ...(operation.scope === 'data'
        ? { data: result.value as Node['data'] }
        : { style: result.value as Node['style'] })
    }
  }
}
