import {
  readCurrentTargetId,
  readNodeValue,
  readSequenceItems,
  readTreeValue
} from './state'
import type {
  MutationWrite
} from '../writer/writes'
import {
  applyMutationWrite
} from './apply'
import type {
  MutationMapValue,
  MutationTableValue
} from '../schema/value'
import type {
  MutationSequenceAnchor
} from '../schema/constants'

const readEntityValue = (
  document: unknown,
  write: Extract<MutationWrite, {
    kind: 'entity.replace' | 'entity.remove'
  }>
): unknown => {
  if (!write.targetId) {
    return undefined
  }

  if (write.node.kind === 'table') {
    const currentTargetId = readCurrentTargetId(write.targetId)
    return currentTargetId
      ? (readNodeValue(write.node, document, write.targetId) as MutationTableValue<string, any> | undefined)?.byId?.[currentTargetId]
      : undefined
  }

  const currentTargetId = readCurrentTargetId(write.targetId)
  return currentTargetId
    ? (readNodeValue(write.node, document, write.targetId) as MutationMapValue<string, any> | undefined)?.[currentTargetId]
    : undefined
}

const anchorForEntityId = (
  ids: readonly string[],
  targetId: string
): MutationSequenceAnchor | undefined => {
  const index = ids.indexOf(targetId)
  if (index < 0) {
    return undefined
  }

  const before = ids[index + 1]
  if (before !== undefined) {
    return {
      before
    }
  }

  return {
    at: 'end'
  }
}

export const invertMutationWrite = (
  document: unknown,
  write: MutationWrite
): readonly MutationWrite[] => {
  switch (write.kind) {
    case 'entity.create':
      return [{
        kind: 'entity.remove',
        node: write.node,
        targetId: write.targetId
      }]
    case 'entity.replace':
      if (write.node.kind === 'singleton') {
        return [{
          kind: 'entity.replace',
          node: write.node,
          value: readNodeValue(write.node, document)
        }]
      }
      if (!write.targetId) {
        throw new Error('Mutation entity.replace inverse requires targetId.')
      }
      const currentEntity = readEntityValue(document, write)
      return currentEntity === undefined
        ? [{
            kind: 'entity.remove',
            node: write.node,
            targetId: write.targetId
          }]
        : [{
            kind: 'entity.replace',
            node: write.node,
            targetId: write.targetId,
            value: currentEntity
          }]
    case 'entity.remove': {
      const current = readEntityValue(document, write)
      return current === undefined
        ? []
        : [{
            kind: 'entity.create',
            node: write.node,
            targetId: write.targetId,
            value: current,
            ...(write.node.kind === 'table'
              ? {
                  anchor: anchorForEntityId(
                    (readNodeValue(write.node, document, write.targetId) as MutationTableValue<string, any> | undefined)?.ids ?? [],
                    readCurrentTargetId(write.targetId) ?? write.targetId
                  )
                }
              : {})
          }]
    }
    case 'entity.move':
      const currentIds = (readNodeValue(write.node, document, write.targetId) as MutationTableValue<string, any> | undefined)?.ids ?? []
      const currentTargetId = readCurrentTargetId(write.targetId) ?? write.targetId
      const previousAnchor = anchorForEntityId(currentIds, currentTargetId)
      return [{
        kind: 'entity.move',
        node: write.node,
        targetId: write.targetId,
        ...(previousAnchor === undefined
          ? {}
          : {
              anchor: previousAnchor
            })
      }]
    case 'field.set':
      return [{
        kind: 'field.set',
        node: write.node,
        ...(write.targetId === undefined ? {} : { targetId: write.targetId }),
        value: readNodeValue(write.node, document, write.targetId)
      }]
    case 'dictionary.set': {
      const current = (readNodeValue(write.node, document, write.targetId) as Record<string, unknown> | undefined) ?? {}
      return Object.prototype.hasOwnProperty.call(current, write.key)
        ? [{
            kind: 'dictionary.set',
            node: write.node,
            ...(write.targetId === undefined ? {} : { targetId: write.targetId }),
            key: write.key,
            value: current[write.key]
          }]
        : [{
            kind: 'dictionary.delete',
            node: write.node,
            ...(write.targetId === undefined ? {} : { targetId: write.targetId }),
            key: write.key
          }]
    }
    case 'dictionary.delete': {
      const current = (readNodeValue(write.node, document, write.targetId) as Record<string, unknown> | undefined) ?? {}
      return Object.prototype.hasOwnProperty.call(current, write.key)
        ? [{
            kind: 'dictionary.set',
            node: write.node,
            ...(write.targetId === undefined ? {} : { targetId: write.targetId }),
            key: write.key,
            value: current[write.key]
          }]
        : []
    }
    case 'dictionary.replace':
      return [{
        kind: 'dictionary.replace',
        node: write.node,
        ...(write.targetId === undefined ? {} : { targetId: write.targetId }),
        value: ((readNodeValue(write.node, document, write.targetId) as Record<string, unknown> | undefined) ?? {})
      }]
    case 'sequence.insert':
    case 'sequence.move':
    case 'sequence.remove':
    case 'sequence.replace':
      return [{
        kind: 'sequence.replace',
        node: write.node,
        ...(write.targetId === undefined ? {} : { targetId: write.targetId }),
        value: [...readSequenceItems(write.node, document, write.targetId)]
      }]
    case 'tree.insert':
    case 'tree.move':
    case 'tree.remove':
    case 'tree.patch':
    case 'tree.replace':
      return [{
        kind: 'tree.replace',
        node: write.node,
        ...(write.targetId === undefined ? {} : { targetId: write.targetId }),
        value: readTreeValue(write.node, document, write.targetId)
      }]
  }
}

export const applyMutationWritesWithInverse = <TDocument,>(
  document: TDocument,
  writes: readonly MutationWrite[]
): {
  document: TDocument
  inverse: readonly MutationWrite[]
} => {
  const inverse: MutationWrite[] = []
  let current = document as unknown

  writes.forEach((write) => {
    const currentInverse = invertMutationWrite(current, write)
    inverse.unshift(...currentInverse)
    current = applyMutationWrite(current, write)
  })

  return {
    document: current as TDocument,
    inverse
  }
}
