import {
  scopeToTargetId,
  targetIdToScope,
} from '../internal/state'
import type {
  MutationSchema,
} from '../schema/node'
import {
  getSchemaNodeById,
  getSchemaNodeId,
} from '../schema/internals'
import type {
  MutationWrite,
} from './writes'

export type SerializedMutationWrite =
  | {
      kind: 'entity.create'
      schemaNodeId: string
      scope: readonly string[]
      value: unknown
      anchor?: import('../schema/constants').MutationSequenceAnchor
    }
  | {
      kind: 'entity.replace'
      schemaNodeId: string
      scope?: readonly string[]
      value: unknown
    }
  | {
      kind: 'entity.remove'
      schemaNodeId: string
      scope: readonly string[]
    }
  | {
      kind: 'entity.move'
      schemaNodeId: string
      scope: readonly string[]
      anchor?: import('../schema/constants').MutationSequenceAnchor
    }
  | {
      kind: 'field.set'
      schemaNodeId: string
      scope?: readonly string[]
      value: unknown
    }
  | {
      kind: 'dictionary.set'
      schemaNodeId: string
      scope?: readonly string[]
      key: string
      value: unknown
    }
  | {
      kind: 'dictionary.delete'
      schemaNodeId: string
      scope?: readonly string[]
      key: string
    }
  | {
      kind: 'dictionary.replace'
      schemaNodeId: string
      scope?: readonly string[]
      value: Readonly<Record<string, unknown>>
    }
  | {
      kind: 'sequence.insert'
      schemaNodeId: string
      scope?: readonly string[]
      value: unknown
      anchor?: import('../schema/constants').MutationSequenceAnchor
    }
  | {
      kind: 'sequence.move'
      schemaNodeId: string
      scope?: readonly string[]
      value: unknown
      anchor?: import('../schema/constants').MutationSequenceAnchor
    }
  | {
      kind: 'sequence.remove'
      schemaNodeId: string
      scope?: readonly string[]
      value: unknown
    }
  | {
      kind: 'sequence.replace'
      schemaNodeId: string
      scope?: readonly string[]
      value: readonly unknown[]
    }
  | {
      kind: 'tree.insert'
      schemaNodeId: string
      scope?: readonly string[]
      nodeId: string
      value: import('../schema/constants').MutationTreeInsertInput<unknown>
    }
  | {
      kind: 'tree.move'
      schemaNodeId: string
      scope?: readonly string[]
      nodeId: string
      value: import('../schema/constants').MutationTreeMoveInput
    }
  | {
      kind: 'tree.remove'
      schemaNodeId: string
      scope?: readonly string[]
      nodeId: string
    }
  | {
      kind: 'tree.patch'
      schemaNodeId: string
      scope?: readonly string[]
      nodeId: string
      value: Record<string, unknown>
    }
  | {
      kind: 'tree.replace'
      schemaNodeId: string
      scope?: readonly string[]
      value: import('../schema/constants').MutationTreeSnapshot<unknown>
    }

const serializeScope = (
  targetId?: string
): readonly string[] | undefined => {
  const scope = targetIdToScope(targetId)
  return scope.length > 0
    ? scope
    : undefined
}

export const serializeMutationWrites = (
  writes: readonly MutationWrite[]
): readonly SerializedMutationWrite[] => writes.map((write) => {
  const schemaNodeId = getSchemaNodeId(write.node)
  const scope = serializeScope(write.targetId)

  switch (write.kind) {
    case 'entity.create':
      return {
        kind: write.kind,
        schemaNodeId,
        scope: scope ?? [],
        value: write.value,
        ...(write.anchor === undefined ? {} : { anchor: write.anchor })
      }
    case 'entity.replace':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        value: write.value
      }
    case 'entity.remove':
      return {
        kind: write.kind,
        schemaNodeId,
        scope: scope ?? []
      }
    case 'entity.move':
      return {
        kind: write.kind,
        schemaNodeId,
        scope: scope ?? [],
        ...(write.anchor === undefined ? {} : { anchor: write.anchor })
      }
    case 'field.set':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        value: write.value
      }
    case 'dictionary.set':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        key: write.key,
        value: write.value
      }
    case 'dictionary.delete':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        key: write.key
      }
    case 'dictionary.replace':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        value: write.value
      }
    case 'sequence.insert':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        value: write.value,
        ...(write.anchor === undefined ? {} : { anchor: write.anchor })
      }
    case 'sequence.move':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        value: write.value,
        ...(write.anchor === undefined ? {} : { anchor: write.anchor })
      }
    case 'sequence.remove':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        value: write.value
      }
    case 'sequence.replace':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        value: write.value
      }
    case 'tree.insert':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        nodeId: write.nodeId,
        value: write.value
      }
    case 'tree.move':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        nodeId: write.nodeId,
        value: write.value
      }
    case 'tree.patch':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        nodeId: write.nodeId,
        value: write.value
      }
    case 'tree.remove':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        nodeId: write.nodeId
      }
    case 'tree.replace':
      return {
        kind: write.kind,
        schemaNodeId,
        ...(scope === undefined ? {} : { scope }),
        value: write.value
      }
  }
})

export const deserializeMutationWrites = <TSchema extends MutationSchema>(
  schema: TSchema,
  writes: readonly SerializedMutationWrite[]
): readonly MutationWrite[] => writes.map((write) => {
  const node = getSchemaNodeById(schema, write.schemaNodeId)
  const targetId = scopeToTargetId(write.scope)

  switch (write.kind) {
    case 'entity.create':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'entity.create' }>['node'],
        targetId: targetId ?? '',
        value: write.value,
        ...(write.anchor === undefined ? {} : { anchor: write.anchor })
      }
    case 'entity.replace':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'entity.replace' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        value: write.value
      }
    case 'entity.remove':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'entity.remove' }>['node'],
        targetId: targetId ?? ''
      }
    case 'entity.move':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'entity.move' }>['node'],
        targetId: targetId ?? '',
        ...(write.anchor === undefined ? {} : { anchor: write.anchor })
      }
    case 'field.set':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'field.set' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        value: write.value
      }
    case 'dictionary.set':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'dictionary.set' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        key: write.key,
        value: write.value
      }
    case 'dictionary.delete':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'dictionary.delete' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        key: write.key
      }
    case 'dictionary.replace':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'dictionary.replace' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        value: write.value
      }
    case 'sequence.insert':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'sequence.insert' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        value: write.value,
        ...(write.anchor === undefined ? {} : { anchor: write.anchor })
      }
    case 'sequence.move':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'sequence.move' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        value: write.value,
        ...(write.anchor === undefined ? {} : { anchor: write.anchor })
      }
    case 'sequence.remove':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'sequence.remove' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        value: write.value
      }
    case 'sequence.replace':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'sequence.replace' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        value: write.value
      }
    case 'tree.insert':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'tree.insert' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        nodeId: write.nodeId,
        value: write.value
      }
    case 'tree.move':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'tree.move' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        nodeId: write.nodeId,
        value: write.value
      }
    case 'tree.patch':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'tree.patch' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        nodeId: write.nodeId,
        value: write.value
      }
    case 'tree.remove':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'tree.remove' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        nodeId: write.nodeId
      }
    case 'tree.replace':
      return {
        kind: write.kind,
        node: node as Extract<MutationWrite, { kind: 'tree.replace' }>['node'],
        ...(targetId === undefined ? {} : { targetId }),
        value: write.value
      }
  }
})
