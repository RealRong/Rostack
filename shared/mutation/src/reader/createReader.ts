import {
  readNodeValue,
  readTreeValue
} from '../internal/state'
import type {
  MutationTreeNodeSnapshot,
  MutationTreeSnapshot
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
  MutationDocument,
  MutationMapValue,
  MutationTableValue,
  MutationValueOfShape
} from '../schema/value'
import type {
  MutationDocumentKeys,
  MutationHasDocumentMembers,
  MutationNamespaceKeys
} from '../schema/facadeTypes'

type MutationReaderField<TValue> = () => TValue

type MutationReaderDictionary<TKey extends string, TValue> = {
  value(): Readonly<Partial<Record<TKey, TValue>>>
  get(key: TKey): TValue | undefined
  has(key: TKey): boolean
  keys(): readonly TKey[]
  entries(): readonly (readonly [TKey, TValue])[]
}

type MutationReaderSequence<TItem> = {
  value(): readonly TItem[]
  ids(): readonly TItem[]
  contains(item: TItem): boolean
  indexOf(item: TItem): number
}

type MutationReaderTree<TNodeId extends string, TValue> = {
  value(): MutationTreeSnapshot<TValue>
  node(nodeId: TNodeId): MutationTreeNodeSnapshot<TValue> | undefined
  parent(nodeId: TNodeId): TNodeId | undefined
  children(nodeId: TNodeId): readonly TNodeId[]
  isRoot(nodeId: TNodeId): boolean
}

type MutationReaderObject<TShape extends MutationShape> = MutationReaderDocument<TShape> & {
  value(): MutationValueOfShape<TShape>
}

type MutationReaderCollection<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationReaderObject<TShape>) & {
  value(): MutationTableValue<TId, TShape> | MutationMapValue<TId, TShape>
  ids(): readonly TId[]
  has(id: TId): boolean
  get(id: TId): MutationEntityValue<TId, TShape> | undefined
}

type MutationReaderNode<TNode> =
  TNode extends MutationFieldNode<infer TValue> ? MutationReaderField<TValue>
  : TNode extends MutationObjectNode<infer TShape> ? MutationReaderObject<TShape>
  : TNode extends MutationDictionaryNode<infer TKey extends string, infer TValue>
    ? MutationReaderDictionary<TKey, TValue>
  : TNode extends MutationSequenceNode<infer TItem>
    ? MutationReaderSequence<TItem>
  : TNode extends MutationTreeNode<infer TNodeId extends string, infer TValue>
    ? MutationReaderTree<TNodeId, TValue>
  : TNode extends MutationSingletonNode<infer TShape>
    ? MutationReaderObject<TShape>
  : TNode extends MutationTableNode<infer TId extends string, infer TShape>
    ? MutationReaderCollection<TId, TShape>
  : TNode extends MutationMapNode<infer TId extends string, infer TShape>
    ? MutationReaderCollection<TId, TShape>
  : TNode extends MutationShape
    ? MutationReaderNamespace<TNode>
  : never

type MutationReaderDocument<TShape extends MutationShape> = {
  readonly [K in MutationDocumentKeys<TShape>]: MutationReaderNode<TShape[K]>
}

type MutationReaderNamespace<TShape extends MutationShape> = {
  readonly [K in MutationNamespaceKeys<TShape>]: MutationReaderNode<TShape[K]>
} & (
  MutationHasDocumentMembers<TShape> extends false
    ? {}
    : {
        document: MutationReaderDocument<TShape>
      }
)

export type MutationReader<TSchema extends MutationSchema = MutationSchema> =
  TSchema extends MutationSchema<infer TShape>
    ? MutationReaderNamespace<TShape>
    : never

const createFieldReader = (
  node: MutationFieldNode<unknown>,
  readDocument: () => unknown,
  targetId?: string
) => () => readNodeValue(node, readDocument(), targetId)

const createDictionaryReader = (
  node: MutationDictionaryNode<string, unknown>,
  readDocument: () => unknown,
  targetId?: string
) => ({
  value: () => (readNodeValue(node, readDocument(), targetId) as Record<string, unknown> | undefined) ?? {},
  get: (key: string) => ((readNodeValue(node, readDocument(), targetId) as Record<string, unknown> | undefined) ?? {})[key],
  has: (key: string) => key in (((readNodeValue(node, readDocument(), targetId) as Record<string, unknown> | undefined) ?? {})),
  keys: () => Object.keys(((readNodeValue(node, readDocument(), targetId) as Record<string, unknown> | undefined) ?? {})),
  entries: () => Object.entries(((readNodeValue(node, readDocument(), targetId) as Record<string, unknown> | undefined) ?? {}))
})

const createSequenceReader = (
  node: MutationSequenceNode<unknown>,
  readDocument: () => unknown,
  targetId?: string
) => ({
  value: () => ((readNodeValue(node, readDocument(), targetId) as readonly unknown[] | undefined) ?? []),
  ids: () => ((readNodeValue(node, readDocument(), targetId) as readonly unknown[] | undefined) ?? []),
  contains: (item: unknown) => (((readNodeValue(node, readDocument(), targetId) as readonly unknown[] | undefined) ?? []).includes(item)),
  indexOf: (item: unknown) => (((readNodeValue(node, readDocument(), targetId) as readonly unknown[] | undefined) ?? []).indexOf(item))
})

const createTreeReader = (
  node: MutationTreeNode<string, unknown>,
  readDocument: () => unknown,
  targetId?: string
) => ({
  value: () => readTreeValue(node, readDocument(), targetId),
  node: (nodeId: string) => readTreeValue(node, readDocument(), targetId).nodes[nodeId],
  parent: (nodeId: string) => readTreeValue(node, readDocument(), targetId).nodes[nodeId]?.parentId,
  children: (nodeId: string) => readTreeValue(node, readDocument(), targetId).nodes[nodeId]?.children ?? [],
  isRoot: (nodeId: string) => readTreeValue(node, readDocument(), targetId).rootIds.includes(nodeId)
})

const hasDocumentMembers = (
  shape: MutationShape
): boolean => Object.values(shape).some((value) => (
  isMutationNode(value)
  && (
    value.kind === 'field'
    || value.kind === 'object'
    || value.kind === 'dictionary'
    || value.kind === 'sequence'
    || value.kind === 'tree'
  )
))

const createDocumentReader = (
  shape: MutationShape,
  readDocument: () => unknown,
  targetId?: string
): Record<string, unknown> => Object.fromEntries(
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
      createNodeReader(
        value as MutationShapeNode,
        readDocument,
        targetId
      )
    ])
)

const createObjectReader = (
  shape: MutationShape,
  readValue: () => unknown,
  readDocument: () => unknown,
  targetId?: string
) => Object.assign(
  createDocumentReader(shape, readDocument, targetId),
  {
    value: readValue
  }
)

const createCollectionReader = (
  node: MutationTableNode<string, MutationShape> | MutationMapNode<string, MutationShape>,
  readDocument: () => unknown
) => Object.assign(
  (id: string) => createObjectReader(
    node.shape,
    () => {
      const source = readNodeValue(node, readDocument()) as MutationTableValue<string, MutationShape> | MutationMapValue<string, MutationShape> | undefined
      if (node.kind === 'table') {
        return (source as MutationTableValue<string, MutationShape> | undefined)?.byId?.[id]
      }
      return (source as MutationMapValue<string, MutationShape> | undefined)?.[id]
    },
    readDocument,
    id
  ),
  {
    value: () => readNodeValue(node, readDocument()) as MutationTableValue<string, MutationShape> | MutationMapValue<string, MutationShape>,
    ids: () => {
      const source = readNodeValue(node, readDocument()) as MutationTableValue<string, MutationShape> | MutationMapValue<string, MutationShape> | undefined
      return node.kind === 'table'
        ? [...((source as MutationTableValue<string, MutationShape> | undefined)?.ids ?? [])]
        : Object.keys((source ?? {}) as Record<string, unknown>)
    },
    has: (id: string) => {
      const source = readNodeValue(node, readDocument()) as MutationTableValue<string, MutationShape> | MutationMapValue<string, MutationShape> | undefined
      return node.kind === 'table'
        ? Boolean((source as MutationTableValue<string, MutationShape> | undefined)?.byId?.[id])
        : Boolean((source as MutationMapValue<string, MutationShape> | undefined)?.[id])
    },
    get: (id: string) => {
      const source = readNodeValue(node, readDocument()) as MutationTableValue<string, MutationShape> | MutationMapValue<string, MutationShape> | undefined
      return node.kind === 'table'
        ? (source as MutationTableValue<string, MutationShape> | undefined)?.byId?.[id]
        : (source as MutationMapValue<string, MutationShape> | undefined)?.[id]
    }
  }
)

const createNodeReader = (
  entry: MutationShapeNode | MutationShape,
  readDocument: () => unknown,
  targetId?: string
): unknown => {
  if (!isMutationNode(entry)) {
    return createNamespaceReader(entry, readDocument, targetId)
  }

  switch (entry.kind) {
    case 'field':
      return createFieldReader(entry, readDocument, targetId)
    case 'dictionary':
      return createDictionaryReader(entry, readDocument, targetId)
    case 'sequence':
      return createSequenceReader(entry, readDocument, targetId)
    case 'tree':
      return createTreeReader(entry, readDocument, targetId)
    case 'object':
      return createObjectReader(
        entry.shape,
        () => readNodeValue(entry, readDocument(), targetId),
        readDocument,
        targetId
      )
    case 'singleton':
      return createObjectReader(
        entry.shape,
        () => readNodeValue(entry, readDocument()),
        readDocument,
        targetId
      )
    case 'table':
    case 'map':
      return createCollectionReader(entry, readDocument)
  }
}

const createNamespaceReader = (
  shape: MutationShape,
  readDocument: () => unknown,
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
        createNodeReader(value, readDocument, targetId)
      ])
  )

  if (!hasDocumentMembers(shape)) {
    return namespace
  }

  return {
    ...namespace,
    document: createDocumentReader(shape, readDocument, targetId)
  }
}

export const createMutationReader = <TSchema extends MutationSchema>(
  schema: TSchema,
  input: MutationDocument<TSchema> | (() => MutationDocument<TSchema>)
): MutationReader<TSchema> => {
  const readDocument = typeof input === 'function'
    ? input as () => unknown
    : () => input as unknown

  return createNamespaceReader(schema.shape, readDocument) as MutationReader<TSchema>
}
