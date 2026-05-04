import type {
  CompiledMutationDictionaryNode,
  CompiledMutationMapNode,
  CompiledMutationNode,
  CompiledMutationObjectNode,
  CompiledMutationSchema,
  CompiledMutationSequenceNode,
  CompiledMutationSingletonNode,
  CompiledMutationTableNode,
  CompiledMutationTreeNode
} from '../compile/schema'
import {
  getCompiledMutationSchema
} from '../compile/schema'
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
import type {
  MutationDocument,
  MutationMapValue,
  MutationTableValue,
  MutationValueOfNode,
  MutationValueOfShape
} from '../schema/value'

type MutationReaderObject<TShape extends MutationShape> = {
  readonly [K in Extract<keyof TShape, string>]: MutationReaderNode<TShape[K]>
}

type MutationEntityReader<TShape extends MutationShape> = MutationReaderObject<TShape> & {
  value(): MutationValueOfShape<TShape> | undefined
}

type MutationFieldReader<TValue> = () => TValue

type MutationDictionaryReader<TKey extends string, TValue> = {
  get(key: TKey): TValue | undefined
  has(key: TKey): boolean
  keys(): readonly TKey[]
  entries(): readonly [TKey, TValue][]
  values(): readonly TValue[]
  value(): Partial<Record<TKey, TValue>>
}

type MutationSequenceReader<TItem> = {
  items(): readonly TItem[]
  value(): readonly TItem[]
  size(): number
}

type MutationTreeReader<TNodeId extends string, TValue> = {
  value(): import('../schema/constants').MutationTreeSnapshot<TValue>
  has(nodeId: TNodeId): boolean
  node(nodeId: TNodeId): import('../schema/constants').MutationTreeNodeSnapshot<TValue> | undefined
}

type MutationSingletonReader<TShape extends MutationShape> = MutationEntityReader<TShape>

type MutationTableReader<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationEntityReader<TShape>) & {
  ids(): readonly TId[]
  has(id: TId): boolean
  get(id: TId): MutationEntityReader<TShape> | undefined
  value(): MutationTableValue<TId, TShape>
}

type MutationMapReader<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationEntityReader<TShape>) & {
  ids(): readonly TId[]
  has(id: TId): boolean
  get(id: TId): MutationEntityReader<TShape> | undefined
  value(): MutationMapValue<TId, TShape>
}

export type MutationReaderNode<TNode> =
  TNode extends MutationFieldNode<infer TValue, infer TOptional extends boolean>
    ? MutationFieldReader<TOptional extends true ? TValue | undefined : TValue>
  : TNode extends MutationObjectNode<infer TShape>
    ? MutationReaderObject<TShape>
  : TNode extends MutationDictionaryNode<infer TKey extends string, infer TValue>
    ? MutationDictionaryReader<TKey, TValue>
  : TNode extends MutationSequenceNode<infer TItem>
    ? MutationSequenceReader<TItem>
  : TNode extends MutationTreeNode<infer TNodeId extends string, infer TValue>
    ? MutationTreeReader<TNodeId, TValue>
  : TNode extends MutationSingletonNode<infer TShape>
    ? MutationSingletonReader<TShape>
  : TNode extends MutationTableNode<infer TId extends string, infer TShape>
    ? MutationTableReader<TId, TShape>
  : TNode extends MutationMapNode<infer TId extends string, infer TShape>
    ? MutationMapReader<TId, TShape>
  : TNode extends MutationShape
    ? MutationReaderObject<TNode>
  : never

export type MutationReader<TSchema extends MutationSchema = MutationSchema> =
  TSchema extends MutationSchema<infer TShape>
    ? MutationReaderObject<TShape>
    : never

type ReadValue<TValue> = () => TValue

const defineLazyProperty = <TObject extends object, TValue>(
  target: TObject,
  key: string,
  create: () => TValue
): void => {
  let initialized = false
  let currentValue: TValue

  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: false,
    get() {
      if (!initialized) {
        currentValue = create()
        initialized = true
      }
      return currentValue
    }
  })
}

const readRecordKeys = <TKey extends string, TValue>(
  value: Partial<Record<TKey, TValue>> | undefined
): TKey[] => Object.keys(value ?? {}) as TKey[]

const createFieldReader = <TValue>(
  readValue: ReadValue<TValue>
): MutationFieldReader<TValue> => () => readValue()

const createDictionaryReader = <TKey extends string, TValue>(
  readValue: ReadValue<Partial<Record<TKey, TValue>> | undefined>
): MutationDictionaryReader<TKey, TValue> => ({
  get(key) {
    return readValue()?.[key]
  },
  has(key) {
    return key in (readValue() ?? {})
  },
  keys() {
    return readRecordKeys(readValue())
  },
  entries() {
    const value = readValue() ?? {}
    return readRecordKeys(value).map((key) => [key, value[key] as TValue] as [TKey, TValue])
  },
  values() {
    const value = readValue() ?? {}
    return readRecordKeys(value).map((key) => value[key] as TValue)
  },
  value() {
    return readValue() ?? {}
  }
})

const createSequenceReader = <TItem>(
  readValue: ReadValue<readonly TItem[] | undefined>
): MutationSequenceReader<TItem> => ({
  items() {
    return readValue() ?? []
  },
  value() {
    return readValue() ?? []
  },
  size() {
    return (readValue() ?? []).length
  }
})

const createTreeReader = <TNodeId extends string, TValue>(
  readValue: ReadValue<import('../schema/constants').MutationTreeSnapshot<TValue> | undefined>
): MutationTreeReader<TNodeId, TValue> => ({
  value() {
    return readValue() ?? {
      rootId: undefined,
      nodes: {}
    }
  },
  has(nodeId) {
    return nodeId in this.value().nodes
  },
  node(nodeId) {
    return this.value().nodes[nodeId]
  }
})

const createObjectReader = (
  node: CompiledMutationObjectNode,
  readValue: ReadValue<unknown>
): object => {
  const result: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(node.entries)) {
    defineLazyProperty(result, key, () => createReaderNode(
      entry,
      () => {
        const owner = readValue() as Record<string, unknown> | undefined
        return owner?.[key]
      }
    ))
  }

  return result
}

const createEntityReader = (
  node: CompiledMutationObjectNode,
  readValue: ReadValue<unknown>
): object => Object.assign(
  createObjectReader(node, readValue),
  {
    value() {
      return readValue()
    }
  }
)

const createTableReader = (
  node: CompiledMutationTableNode,
  readValue: ReadValue<unknown>
): MutationTableReader<string, MutationShape> => {
  const entityCache = new Map<string, object>()

  const createEntity = (id: string) => {
    const cached = entityCache.get(id)
    if (cached) {
      return cached
    }

    const next = createEntityReader(
      node.entity,
      () => {
        const table = (readValue() ?? {
          ids: [],
          byId: {}
        }) as MutationTableValue<string, MutationShape>
        return table.byId[id]
      }
    )
    entityCache.set(id, next)
    return next
  }

  return Object.assign(
    (id: string) => createEntity(id),
    {
      ids() {
        const table = readValue() as MutationTableValue<string, MutationShape> | undefined
        return table?.ids ?? []
      },
      has(id: string) {
        const table = readValue() as MutationTableValue<string, MutationShape> | undefined
        return table?.byId[id] !== undefined
      },
      get(id: string) {
        return this.has(id) ? createEntity(id) : undefined
      },
      value() {
        return (readValue() as MutationTableValue<string, MutationShape> | undefined) ?? {
          ids: [],
          byId: {}
        }
      }
    }
  ) as MutationTableReader<string, MutationShape>
}

const createMapReader = (
  node: CompiledMutationMapNode,
  readValue: ReadValue<unknown>
): MutationMapReader<string, MutationShape> => {
  const entityCache = new Map<string, object>()

  const createEntity = (id: string) => {
    const cached = entityCache.get(id)
    if (cached) {
      return cached
    }

    const next = createEntityReader(
      node.entity,
      () => (readValue() as MutationMapValue<string, MutationShape> | undefined)?.[id]
    )
    entityCache.set(id, next)
    return next
  }

  return Object.assign(
    (id: string) => createEntity(id),
    {
      ids() {
        return readRecordKeys(readValue() as MutationMapValue<string, MutationShape> | undefined)
      },
      has(id: string) {
        const value = readValue() as MutationMapValue<string, MutationShape> | undefined
        return value?.[id] !== undefined
      },
      get(id: string) {
        return this.has(id) ? createEntity(id) : undefined
      },
      value() {
        return (readValue() as MutationMapValue<string, MutationShape> | undefined) ?? {}
      }
    }
  ) as MutationMapReader<string, MutationShape>
}

const createSingletonReader = (
  node: CompiledMutationSingletonNode,
  readValue: ReadValue<unknown>
): MutationSingletonReader<MutationShape> => createEntityReader(
  node.entity,
  () => readValue()
) as MutationSingletonReader<MutationShape>

const createReaderNode = (
  node: CompiledMutationNode,
  readValue: ReadValue<unknown>
): unknown => {
  switch (node.kind) {
    case 'field':
      return createFieldReader(readValue)
    case 'dictionary':
      return createDictionaryReader(
        readValue as ReadValue<Partial<Record<string, unknown>> | undefined>
      )
    case 'sequence':
      return createSequenceReader(readValue as ReadValue<readonly unknown[] | undefined>)
    case 'tree':
      return createTreeReader(
        readValue as ReadValue<import('../schema/constants').MutationTreeSnapshot<unknown> | undefined>
      )
    case 'object':
      return createObjectReader(node, readValue)
    case 'singleton':
      return createSingletonReader(node, readValue)
    case 'table':
      return createTableReader(node, readValue)
    case 'map':
      return createMapReader(node, readValue)
  }
}

export const createMutationReader = <TSchema extends MutationSchema>(
  schema: TSchema,
  document: MutationDocument<TSchema>
): MutationReader<TSchema> => createObjectReader(
  getCompiledMutationSchema(schema).root,
  () => document as MutationValueOfNode<TSchema['shape']>
) as MutationReader<TSchema>

export const reader = createMutationReader
