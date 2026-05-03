import type { Document } from '@whiteboard/core/types'

const hasOwn = (target: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(target, key)

const assertEntityRecord = <TId extends string, T extends { id: TId }>(
  name: string,
  record: Partial<Record<TId, T>>
) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`Document ${name} must be a record.`)
  }

  for (const [id, entity] of Object.entries(record) as Array<[TId, T | undefined]>) {
    if (!entity || typeof entity !== 'object') {
      throw new Error(`Document ${name}.${id} must be an object.`)
    }
    if (entity.id !== id) {
      throw new Error(`Document ${name}.${id} has mismatched entity id.`)
    }
  }
}

export const assertDocument = (document: unknown): Document => {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Document must be an object.')
  }

  const value = document as Document

  if (typeof value.id !== 'string' || !value.id) {
    throw new Error('Document id is required.')
  }

  assertEntityRecord('nodes', value.nodes)
  assertEntityRecord('edges', value.edges)
  assertEntityRecord('groups', value.groups)
  assertEntityRecord('mindmaps', value.mindmaps)

  if (!Array.isArray(value.order)) {
    throw new Error('Document order must be an array.')
  }

  value.order.forEach((ref, index) => {
    if (!ref || typeof ref !== 'object') {
      throw new Error(`Document order.${index} must be an object.`)
    }
    if (ref.kind === 'node') {
      if (!hasOwn(value.nodes, ref.id)) {
        throw new Error(`Document order.${index} contains missing node ${ref.id}.`)
      }
      return
    }
    if (ref.kind === 'mindmap') {
      if (!hasOwn(value.mindmaps, ref.id)) {
        throw new Error(`Document order.${index} contains missing mindmap ${ref.id}.`)
      }
      return
    }
    if (ref.kind === 'edge') {
      if (!hasOwn(value.edges, ref.id)) {
        throw new Error(`Document order.${index} contains missing edge ${ref.id}.`)
      }
      return
    }
    throw new Error(`Document order.${index} has invalid kind.`)
  })

  return value
}
