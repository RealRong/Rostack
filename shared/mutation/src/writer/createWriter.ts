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
  MutationNamespaceKeys,
  MutationShapeKeys
} from '../schema/facadeTypes'
import type {
  MutationWrite
} from './writes'
import {
  scopeTargetId
} from '../internal/state'
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

type MutationWriterSequence<TItem> = {
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

type MutationWriterShape<TShape extends MutationShape> = {
  readonly [K in MutationShapeKeys<TShape>]: MutationWriterNode<TShape[K]>
} & {
  patch(patch: Partial<MutationValueOfShape<TShape>>): void
}

type MutationWriterObject<TShape extends MutationShape> = MutationWriterShape<TShape> & {
  patch(patch: Partial<MutationValueOfShape<TShape>>): void
}

type MutationWriterCollectionItem<TId extends string, TShape extends MutationShape> = MutationWriterObject<TShape> & {
  replace(value: MutationEntityValue<TId, TShape>): void
  remove(): void
}

type MutationWriterTableCollection<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationWriterCollectionItem<TId, TShape>) & {
  create(value: MutationEntityValue<TId, TShape>, anchor?: MutationSequenceAnchor): void
  move(id: TId, anchor?: MutationSequenceAnchor): void
  remove(id: TId): void
  replace(id: TId, value: MutationEntityValue<TId, TShape>): void
}

type MutationWriterMapCollection<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationWriterCollectionItem<TId, TShape>) & {
  create(value: MutationEntityValue<TId, TShape>): void
  remove(id: TId): void
  replace(id: TId, value: MutationEntityValue<TId, TShape>): void
}

type MutationWriterNode<TNode> =
  TNode extends MutationFieldNode<infer TValue, infer TOptional extends boolean>
    ? MutationWriterField<TOptional extends true ? TValue | undefined : TValue>
  : TNode extends MutationObjectNode<infer TShape> ? MutationWriterObject<TShape>
  : TNode extends MutationDictionaryNode<infer TKey extends string, infer TValue>
    ? MutationWriterDictionary<TKey, TValue>
  : TNode extends MutationSequenceNode<infer TItem>
    ? MutationWriterSequence<TItem>
  : TNode extends MutationTreeNode<infer TNodeId extends string, infer TValue>
    ? MutationWriterTree<TNodeId, TValue>
  : TNode extends MutationSingletonNode<infer TShape>
    ? MutationWriterObject<TShape> & {
        replace(value: MutationValueOfShape<TShape>): void
      }
  : TNode extends MutationTableNode<infer TId extends string, infer TShape>
    ? MutationWriterTableCollection<TId, TShape>
  : TNode extends MutationMapNode<infer TId extends string, infer TShape>
    ? MutationWriterMapCollection<TId, TShape>
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
  node: MutationFieldNode<unknown, boolean>,
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
  insert(item: unknown, anchor?: MutationSequenceAnchor) {
    pushWrite(writes, {
      kind: 'sequence.insert',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      value: item,
      ...(anchor === undefined ? {} : { anchor })
    })
  },
  move(item: unknown, anchor?: MutationSequenceAnchor) {
    pushWrite(writes, {
      kind: 'sequence.move',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      value: item,
      ...(anchor === undefined ? {} : { anchor })
    })
  },
  remove(item: unknown) {
    pushWrite(writes, {
      kind: 'sequence.remove',
      node,
      ...(targetId === undefined ? {} : { targetId }),
      value: item
    })
  },
  replace(value: readonly unknown[]) {
    pushWrite(writes, {
      kind: 'sequence.replace',
      node,
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

const createShapeWriter = (
  shape: MutationShape,
  writes: MutationWrite[],
  targetId?: string
): Record<string, unknown> => {
  const base = Object.fromEntries(
    Object.entries(shape)
      .map(([key, value]) => [
        key,
        createNodeWriter(value as MutationShapeNode | MutationShape, writes, targetId)
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
  ...createShapeWriter(node.shape, writes, targetId)
})

const createSingletonWriter = (
  node: MutationSingletonNode<MutationShape>,
  writes: MutationWrite[]
) => ({
  ...createShapeWriter(node.shape, writes),
  replace(value: MutationValueOfShape<typeof node.shape>) {
    pushWrite(writes, {
      kind: 'entity.replace',
      node,
      value
    })
  }
})

const createCollectionItemWriter = (
  node: MutationTableNode<string, MutationShape> | MutationMapNode<string, MutationShape>,
  writes: MutationWrite[],
  id: string,
  ownerTargetId?: string
) => ({
  ...createShapeWriter(node.shape, writes, scopeTargetId(ownerTargetId, id)),
  replace(value: MutationEntityValue<string, MutationShape>) {
    pushWrite(writes, {
      kind: 'entity.replace',
      node,
      targetId: scopeTargetId(ownerTargetId, id),
      value
    })
  },
  remove() {
    pushWrite(writes, {
      kind: 'entity.remove',
      node,
      targetId: scopeTargetId(ownerTargetId, id)
    })
  }
})

const createTableWriter = (
  node: MutationTableNode<string, MutationShape>,
  writes: MutationWrite[],
  ownerTargetId?: string
) => Object.assign(
  (id: string) => createCollectionItemWriter(node, writes, id, ownerTargetId),
  {
    create(value: MutationEntityValue<string, MutationShape>, anchor?: MutationSequenceAnchor) {
      pushWrite(writes, {
        kind: 'entity.create',
        node,
        targetId: scopeTargetId(ownerTargetId, value.id),
        value,
        ...(anchor === undefined ? {} : { anchor })
      })
    },
    move(id: string, anchor?: MutationSequenceAnchor) {
      pushWrite(writes, {
        kind: 'entity.move',
        node,
        targetId: scopeTargetId(ownerTargetId, id),
        ...(anchor === undefined ? {} : { anchor })
      })
    },
    remove(id: string) {
      pushWrite(writes, {
        kind: 'entity.remove',
        node,
        targetId: scopeTargetId(ownerTargetId, id)
      })
    },
    replace(id: string, value: MutationEntityValue<string, MutationShape>) {
      pushWrite(writes, {
        kind: 'entity.replace',
        node,
        targetId: scopeTargetId(ownerTargetId, id),
        value
      })
    }
  }
)

const createMapWriter = (
  node: MutationMapNode<string, MutationShape>,
  writes: MutationWrite[],
  ownerTargetId?: string
) => Object.assign(
  (id: string) => createCollectionItemWriter(node, writes, id, ownerTargetId),
  {
    create(value: MutationEntityValue<string, MutationShape>) {
      pushWrite(writes, {
        kind: 'entity.create',
        node,
        targetId: scopeTargetId(ownerTargetId, value.id),
        value
      })
    },
    remove(id: string) {
      pushWrite(writes, {
        kind: 'entity.remove',
        node,
        targetId: scopeTargetId(ownerTargetId, id)
      })
    },
    replace(id: string, value: MutationEntityValue<string, MutationShape>) {
      pushWrite(writes, {
        kind: 'entity.replace',
        node,
        targetId: scopeTargetId(ownerTargetId, id),
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
      return createTableWriter(entry, writes, targetId)
    case 'map':
      return createMapWriter(entry, writes, targetId)
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
