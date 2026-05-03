import type {
  MutationMapValue,
  MutationTableValue
} from '../schema/value'
import {
  getNodeMeta
} from '../schema/meta'
import {
  readNodeValue,
  readSequenceItems,
  readTreeValue,
  removeSequenceItem,
  replaceSequence,
  insertSequenceItem,
  moveSequenceItem,
  insertTreeNode,
  moveTreeNode,
  patchTreeNodeValue,
  removeTreeNode,
  writeNodeValue
} from './state'
import type {
  MutationWrite
} from '../writer/writes'

const applyEntityCreate = (
  document: unknown,
  write: Extract<MutationWrite, {
    kind: 'entity.create'
  }>
): unknown => {
  if (write.node.kind === 'table') {
    const current = readNodeValue(write.node, document) as MutationTableValue<string, any> | undefined
    const ids = current?.ids ?? []
    const byId = current?.byId ?? {}
    return writeNodeValue(write.node, document, {
      ids: ids.includes(write.targetId)
        ? ids
        : [...ids, write.targetId],
      byId: {
        ...byId,
        [write.targetId]: write.value
      }
    })
  }

  const current = readNodeValue(write.node, document) as MutationMapValue<string, any> | undefined
  return writeNodeValue(write.node, document, {
    ...(current ?? {}),
    [write.targetId]: write.value
  })
}

const applyEntityReplace = (
  document: unknown,
  write: Extract<MutationWrite, {
    kind: 'entity.replace'
  }>
): unknown => {
  if (write.node.kind === 'singleton') {
    return writeNodeValue(write.node, document, write.value)
  }

  if (write.node.kind === 'table') {
    if (!write.targetId) {
      throw new Error('Mutation entity.replace on table requires targetId.')
    }
    const current = readNodeValue(write.node, document) as MutationTableValue<string, any> | undefined
    const ids = current?.ids ?? []
    return writeNodeValue(write.node, document, {
      ids: ids.includes(write.targetId)
        ? ids
        : [...ids, write.targetId],
      byId: {
        ...(current?.byId ?? {}),
        [write.targetId]: write.value
      }
    })
  }

  if (!write.targetId) {
    throw new Error('Mutation entity.replace on map requires targetId.')
  }
  const current = readNodeValue(write.node, document) as MutationMapValue<string, any> | undefined
  return writeNodeValue(write.node, document, {
    ...(current ?? {}),
    [write.targetId]: write.value
  })
}

const applyEntityRemove = (
  document: unknown,
  write: Extract<MutationWrite, {
    kind: 'entity.remove'
  }>
): unknown => {
  if (write.node.kind === 'table') {
    const current = readNodeValue(write.node, document) as MutationTableValue<string, any> | undefined
    const ids = (current?.ids ?? []).filter((id) => id !== write.targetId)
    const byId = {
      ...(current?.byId ?? {})
    }
    delete byId[write.targetId]
    return writeNodeValue(write.node, document, {
      ids,
      byId
    })
  }

  const current = readNodeValue(write.node, document) as MutationMapValue<string, any> | undefined
  const next = {
    ...(current ?? {})
  }
  delete next[write.targetId]
  return writeNodeValue(write.node, document, next)
}

const applyFieldSet = (
  document: unknown,
  write: Extract<MutationWrite, {
    kind: 'field.set'
  }>
): unknown => writeNodeValue(
  write.node,
  document,
  write.value,
  write.targetId
)

const applyDictionarySet = (
  document: unknown,
  write: Extract<MutationWrite, {
    kind: 'dictionary.set'
  }>
): unknown => {
  const current = (readNodeValue(write.node, document, write.targetId) as Record<string, unknown> | undefined) ?? {}
  return writeNodeValue(write.node, document, {
    ...current,
    [write.key]: write.value
  }, write.targetId)
}

const applyDictionaryDelete = (
  document: unknown,
  write: Extract<MutationWrite, {
    kind: 'dictionary.delete'
  }>
): unknown => {
  const current = (readNodeValue(write.node, document, write.targetId) as Record<string, unknown> | undefined) ?? {}
  const next = {
    ...current
  }
  delete next[write.key]
  return writeNodeValue(write.node, document, next, write.targetId)
}

const applySequenceWrite = (
  document: unknown,
  write: Extract<MutationWrite, {
    kind: 'sequence.insert' | 'sequence.move' | 'sequence.remove' | 'sequence.replace'
  }>
): unknown => {
  const current = readSequenceItems(write.node, document, write.targetId)
  const next = (() => {
    switch (write.kind) {
      case 'sequence.insert':
        return insertSequenceItem(current, write.value, write.anchor)
      case 'sequence.move':
        return moveSequenceItem(current, write.value, write.anchor)
      case 'sequence.remove':
        return removeSequenceItem(current, write.value)
      case 'sequence.replace':
        return replaceSequence(current, write.value)
    }
  })()

  return writeNodeValue(write.node, document, next, write.targetId)
}

const applyTreeWrite = (
  document: unknown,
  write: Extract<MutationWrite, {
    kind: 'tree.insert' | 'tree.move' | 'tree.remove' | 'tree.patch' | 'tree.replace'
  }>
): unknown => {
  const current = readTreeValue(write.node, document, write.targetId)
  const next = (() => {
    switch (write.kind) {
      case 'tree.insert':
        return insertTreeNode(current, write.nodeId, write.value)
      case 'tree.move':
        return moveTreeNode(current, write.nodeId, write.value)
      case 'tree.remove':
        return removeTreeNode(current, write.nodeId)
      case 'tree.patch':
        return patchTreeNodeValue(current, write.nodeId, write.value)
      case 'tree.replace':
        return write.value
    }
  })()

  return writeNodeValue(write.node, document, next, write.targetId)
}

export const applyMutationWrite = (
  document: unknown,
  write: MutationWrite
): unknown => {
  switch (write.kind) {
    case 'entity.create':
      return applyEntityCreate(document, write)
    case 'entity.replace':
      return applyEntityReplace(document, write)
    case 'entity.remove':
      return applyEntityRemove(document, write)
    case 'field.set':
      return applyFieldSet(document, write)
    case 'dictionary.set':
      return applyDictionarySet(document, write)
    case 'dictionary.delete':
      return applyDictionaryDelete(document, write)
    case 'dictionary.replace':
      return writeNodeValue(write.node, document, write.value, write.targetId)
    case 'sequence.insert':
    case 'sequence.move':
    case 'sequence.remove':
    case 'sequence.replace':
      return applySequenceWrite(document, write)
    case 'tree.insert':
    case 'tree.move':
    case 'tree.remove':
    case 'tree.patch':
    case 'tree.replace':
      return applyTreeWrite(document, write)
  }
}

export const applyMutationWrites = <TDocument,>(
  document: TDocument,
  writes: readonly MutationWrite[]
): TDocument => {
  return writes.reduce<TDocument>(
    (current, write) => applyMutationWrite(current, write) as TDocument,
    document
  )
}

export const describeMutationWrite = (
  write: MutationWrite
): {
  nodeKey: string
  path: readonly string[]
  targetId?: string
  key?: string
  itemId?: string
  nodeId?: string
} => {
  const targetNode = write.node
  const meta = getNodeMeta(targetNode)

  switch (write.kind) {
    case 'field.set':
      return {
        nodeKey: meta.key,
        path: meta.path,
        targetId: write.targetId
      }
    case 'dictionary.set':
    case 'dictionary.delete':
      return {
        nodeKey: meta.key,
        path: meta.path,
        targetId: write.targetId,
        key: write.key
      }
    case 'sequence.insert':
    case 'sequence.move':
    case 'sequence.remove':
    case 'sequence.replace':
      return {
        nodeKey: meta.key,
        path: meta.path,
        targetId: write.targetId,
        ...(write.kind === 'sequence.replace' ? {} : { itemId: write.value })
      }
    case 'tree.insert':
    case 'tree.move':
    case 'tree.remove':
    case 'tree.patch':
      return {
        nodeKey: meta.key,
        path: meta.path,
        targetId: write.targetId,
        nodeId: write.nodeId
      }
    case 'tree.replace':
      return {
        nodeKey: meta.key,
        path: meta.path,
        targetId: write.targetId
      }
    case 'entity.create':
    case 'entity.replace':
    case 'entity.remove':
      return {
        nodeKey: meta.key,
        path: meta.path,
        targetId: write.targetId
      }
  }

  throw new Error('Unknown mutation write.')
}
