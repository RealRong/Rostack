import type {
  MutationSequenceAnchor,
  MutationTreeInsertInput,
  MutationTreeMoveInput
} from '../schema/constants'
import type {
  MutationDictionaryNode,
  MutationFieldNode,
  MutationMapNode,
  MutationObjectNode,
  MutationSchema,
  MutationSequenceNode,
  MutationShape,
  MutationShapeNode,
  MutationSingletonNode,
  MutationTableNode,
  MutationTreeNode
} from '../schema/node'
import {
  isMutationGroup,
  isMutationNode
} from '../schema/node'
import type {
  MutationEntityValue,
  MutationValueOfShape
} from '../schema/value'
import type {
  MutationDocumentKeys,
  MutationHasDocumentMembers,
  MutationNamespaceKeys
} from '../schema/facadeTypes'
import type {
  MutationWrite
} from './writes'
import {
  emitShapePatch,
  hasWritableDocumentMembers
} from './patch'

type MutationWriterField<TValue> = {
  set(value: TValue): void
}

type MutationWriterDictionary<TKey extends string, TValue> = {
  set(key: TKey, value: TValue): void
  delete(key: TKey): void
  replace(value: Readonly<Partial<Record<TKey, TValue>>>): void
}

type MutationWriterSequence<TItem extends string> = {
  insert(item: TItem, anchor?: MutationSequenceAnchor): void
  move(item: TItem, anchor?: MutationSequenceAnchor): void
  remove(item: TItem): void
  replace(items: readonly TItem[]): void
}

type MutationWriterTree<TNodeId extends string, TValue> = {
  insert(nodeId: TNodeId, input: MutationTreeInsertInput<TValue>): void
  move(nodeId: TNodeId, input: MutationTreeMoveInput): void
  remove(nodeId: TNodeId): void
  patch(nodeId: TNodeId, patch: Record<string, unknown>): void
  replace(tree: import('../schema/constants').MutationTreeSnapshot<TValue>): void
}

type MutationWriterObject<TShape extends MutationShape> = MutationWriterDocument<TShape> & {
  patch(patch: Partial<MutationValueOfShape<TShape>>): void
}

type MutationWriterCollection<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationWriterObject<TShape> & {
  replace(value: MutationEntityValue<TId, TShape>): void
  remove(): void
}) & {
  create(value: MutationEntityValue<TId, TShape>): void
  remove(id: TId): void
  replace(id: TId, value: MutationEntityValue<TId, TShape>): void
}

type MutationWriterNode<TNode> =
  TNode extends MutationFieldNode<infer TValue> ? MutationWriterField<TValue>
  : TNode extends MutationObjectNode<infer TShape> ? MutationWriterObject<TShape>
  : TNode extends MutationDictionaryNode<infer TKey extends string, infer TValue>
    ? MutationWriterDictionary<TKey, TValue>
  : TNode extends MutationSequenceNode<infer TItem extends string>
    ? MutationWriterSequence<TItem>
  : TNode extends MutationTreeNode<infer TNodeId extends string, infer TValue>
    ? MutationWriterTree<TNodeId, TValue>
  : TNode extends MutationSingletonNode<infer TShape>
    ? MutationWriterObject<TShape> & {
        replace(value: MutationValueOfShape<TShape>): void
      }
  : TNode extends MutationTableNode<infer TId extends string, infer TShape>
    ? MutationWriterCollection<TId, TShape>
  : TNode extends MutationMapNode<infer TId extends string, infer TShape>
    ? MutationWriterCollection<TId, TShape>
  : TNode extends MutationShape
    ? MutationWriterNamespace<TNode>
  : never

type MutationWriterDocument<TShape extends MutationShape> = {
  readonly [K in MutationDocumentKeys<TShape>]: MutationWriterNode<TShape[K]>
} & {
  patch(patch: Partial<MutationValueOfShape<TShape>>): void
}

type MutationWriterNamespace<TShape extends MutationShape> = {
  readonly [K in MutationNamespaceKeys<TShape>]: MutationWriterNode<TShape[K]>
} & (
  MutationHasDocumentMembers<TShape> extends false
    ? {}
    : {
        document: MutationWriterDocument<TShape>
      }
)

export type MutationWriter<TSchema extends MutationSchema = MutationSchema> =
  TSchema extends MutationSchema<infer TShape>
    ? MutationWriterNamespace<TShape> & {
        writes(): readonly MutationWrite[]
      }
    : never

const pushWrite = (
  writes: MutationWrite[],
  write: MutationWrite
) => {
  writes.push(write)
}

const createFieldWriter = (
  node: MutationFieldNode<unknown>,
  writes: MutationWrite[],
  targetId?: string
) => ({
  set(value: unknown) {
    pushWrite(writes, {
      kind: 'field.set',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      value
    })
  }
})

const createDictionaryWriter = (
  node: MutationDictionaryNode<string, unknown>,
  writes: MutationWrite[],
  targetId?: string
) => ({
  set(key: string, value: unknown) {
    pushWrite(writes, {
      kind: 'dictionary.set',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      key,
      value
    })
  },
  delete(key: string) {
    pushWrite(writes, {
      kind: 'dictionary.delete',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      key
    })
  },
  replace(value: Readonly<Record<string, unknown>>) {
    pushWrite(writes, {
      kind: 'dictionary.replace',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      value
    })
  }
})

const createSequenceWriter = (
  node: MutationSequenceNode<unknown>,
  writes: MutationWrite[],
  targetId?: string
) => ({
  insert(item: string, anchor?: MutationSequenceAnchor) {
    pushWrite(writes, {
      kind: 'sequence.insert',
      node: node as MutationSequenceNode<string>,
      ...(targetId === undefined ? {} : { targetId }),
      value: item,
      ...(anchor === undefined ? {} : { anchor })
    })
  },
  move(item: string, anchor?: MutationSequenceAnchor) {
    pushWrite(writes, {
      kind: 'sequence.move',
      node: node as MutationSequenceNode<string>,
      ...(targetId === undefined ? {} : { targetId }),
      value: item,
      ...(anchor === undefined ? {} : { anchor })
    })
  },
  remove(item: string) {
    pushWrite(writes, {
      kind: 'sequence.remove',
      node: node as MutationSequenceNode<string>,
      ...(targetId === undefined ? {} : { targetId }),
      value: item
    })
  },
  replace(value: readonly string[]) {
    pushWrite(writes, {
      kind: 'sequence.replace',
      node: node as MutationSequenceNode<string>,
      ...(targetId === undefined ? {} : { targetId }),
      value
    })
  }
})

const createTreeWriter = (
  node: MutationTreeNode<string, unknown>,
  writes: MutationWrite[],
  targetId?: string
) => ({
  insert(nodeId: string, value: MutationTreeInsertInput<unknown>) {
    pushWrite(writes, {
      kind: 'tree.insert',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      nodeId,
      value
    })
  },
  move(nodeId: string, value: MutationTreeMoveInput) {
    pushWrite(writes, {
      kind: 'tree.move',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      nodeId,
      value
    })
  },
  remove(nodeId: string) {
    pushWrite(writes, {
      kind: 'tree.remove',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      nodeId
    })
  },
  patch(nodeId: string, value: Record<string, unknown>) {
    pushWrite(writes, {
      kind: 'tree.patch',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      nodeId,
      value
    })
  },
  replace(value: import('../schema/constants').MutationTreeSnapshot<unknown>) {
    pushWrite(writes, {
      kind: 'tree.replace',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      value
    })
  }
})

const createDocumentWriter = (
  shape: MutationShape,
  writes: MutationWrite[],
  targetId?: string
): Record<string, unknown> => {
  const base = Object.fromEntries(
    Object.entries(shape)
      .filter(([, value]) => isMutationNode(value) && (
        value.kind === 'field'
        || value.kind === 'object'
        || value.kind === 'dictionary'
        || value.kind === 'sequence'
        || value.kind === 'tree'
      ))
      .map(([key, value]) => [
        key,
        createNodeWriter(value as MutationShapeNode, writes, targetId)
      ])
  )

  return {
    ...base,
    patch(patch: Partial<MutationValueOfShape<typeof shape>>) {
      emitShapePatch(
        shape,
        patch as Record<string, unknown>,
        targetId,
        writes
      )
    }
  }
}

const createObjectWriter = (
  node: MutationObjectNode<MutationShape>,
  writes: MutationWrite[],
  targetId?: string
) => ({
  ...createDocumentWriter(node.shape, writes, targetId)
})

const createSingletonWriter = (
  node: MutationSingletonNode<MutationShape>,
  writes: MutationWrite[]
) => ({
  ...createDocumentWriter(node.shape, writes),
  replace(value: MutationValueOfShape<typeof node.shape>) {
    pushWrite(writes, {
      kind: 'entity.replace',
      node,
      value
    })
  }
})

const createCollectionWriter = (
  node: MutationTableNode<string, MutationShape> | MutationMapNode<string, MutationShape>,
  writes: MutationWrite[]
) => Object.assign(
  (id: string) => ({
    ...createDocumentWriter(node.shape, writes, id),
    replace(value: MutationEntityValue<string, MutationShape>) {
      pushWrite(writes, {
        kind: 'entity.replace',
        node,
        targetId: id,
        value
      })
    },
    remove() {
      pushWrite(writes, {
        kind: 'entity.remove',
        node,
        targetId: id
      })
    }
  }),
  {
    create(value: MutationEntityValue<string, MutationShape>) {
      pushWrite(writes, {
        kind: 'entity.create',
        node,
        targetId: value.id,
        value
      })
    },
    remove(id: string) {
      pushWrite(writes, {
        kind: 'entity.remove',
        node,
        targetId: id
      })
    },
    replace(id: string, value: MutationEntityValue<string, MutationShape>) {
      pushWrite(writes, {
        kind: 'entity.replace',
        node,
        targetId: id,
        value
      })
    }
  }
)

const createNodeWriter = (
  entry: MutationShapeNode | MutationShape,
  writes: MutationWrite[],
  targetId?: string
): unknown => {
  if (!isMutationNode(entry)) {
    return createNamespaceWriter(entry, writes, targetId)
  }

  switch (entry.kind) {
    case 'field':
      return createFieldWriter(entry, writes, targetId)
    case 'dictionary':
      return createDictionaryWriter(entry, writes, targetId)
    case 'sequence':
      return createSequenceWriter(entry, writes, targetId)
    case 'tree':
      return createTreeWriter(entry as MutationTreeNode<string, unknown>, writes, targetId)
    case 'object':
      return createObjectWriter(entry, writes, targetId)
    case 'singleton':
      return createSingletonWriter(entry, writes)
    case 'table':
    case 'map':
      return createCollectionWriter(entry, writes)
  }
}

const createNamespaceWriter = (
  shape: MutationShape,
  writes: MutationWrite[],
  targetId?: string
): Record<string, unknown> => {
  const namespace = Object.fromEntries(
    Object.entries(shape)
      .filter(([, value]) => (
        isMutationGroup(value)
        || (
          isMutationNode(value)
          && (
            value.kind === 'singleton'
            || value.kind === 'table'
            || value.kind === 'map'
          )
        )
      ))
      .map(([key, value]) => [
        key,
        createNodeWriter(value, writes, targetId)
      ])
  )

  if (!hasWritableDocumentMembers(shape)) {
    return namespace
  }

  return {
    ...namespace,
    document: createDocumentWriter(shape, writes, targetId)
  }
}

export const createMutationWriter = <TSchema extends MutationSchema>(
  schema: TSchema,
  writes: MutationWrite[] = []
): MutationWriter<TSchema> => {
  const writer = createNamespaceWriter(schema.shape, writes) as MutationWriter<TSchema>
  return Object.assign(writer, {
    writes: () => [...writes]
  })
}
