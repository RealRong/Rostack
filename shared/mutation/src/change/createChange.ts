import type {
  CompiledMutationMapNode,
  CompiledMutationNode,
  CompiledMutationObjectNode,
  CompiledMutationSchema,
  CompiledMutationSingletonNode,
  CompiledMutationTableNode
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
  MutationSingletonNode,
  MutationTableNode,
  MutationTreeNode
} from '../schema/node'
import type {
  MutationEntityTarget,
  MutationWrite
} from '../writer/writes'

type MutationChangeObject<TShape extends MutationShape> = {
  readonly [K in Extract<keyof TShape, string>]: MutationChangeNode<TShape[K]>
}

type MutationEntityChange<TShape extends MutationShape> = MutationChangeObject<TShape> & {
  changed(): boolean
}

type MutationFieldChange = {
  changed(): boolean
}

type MutationDictionaryChange<TKey extends string> = {
  changed(key?: TKey): boolean
}

type MutationSequenceChange<TItem> = {
  changed(value?: TItem): boolean
}

type MutationTreeChange<TNodeId extends string> = {
  changed(nodeId?: TNodeId): boolean
}

type MutationSingletonChange<TShape extends MutationShape> = MutationEntityChange<TShape>

type MutationTableChange<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationEntityChange<TShape>) & {
  changed(id?: TId): boolean
  created(id: TId): boolean
  removed(id: TId): boolean
}

type MutationMapChange<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationEntityChange<TShape>) & {
  changed(id?: TId): boolean
  created(id: TId): boolean
  removed(id: TId): boolean
}

export type MutationChangeNode<TNode> =
  TNode extends MutationFieldNode<any, any>
    ? MutationFieldChange
  : TNode extends MutationObjectNode<infer TShape>
    ? MutationChangeObject<TShape>
  : TNode extends MutationDictionaryNode<infer TKey extends string, any>
    ? MutationDictionaryChange<TKey>
  : TNode extends MutationSequenceNode<infer TItem>
    ? MutationSequenceChange<TItem>
  : TNode extends MutationTreeNode<infer TNodeId extends string, any>
    ? MutationTreeChange<TNodeId>
  : TNode extends MutationSingletonNode<infer TShape>
    ? MutationSingletonChange<TShape>
  : TNode extends MutationTableNode<infer TId extends string, infer TShape>
    ? MutationTableChange<TId, TShape>
  : TNode extends MutationMapNode<infer TId extends string, infer TShape>
    ? MutationMapChange<TId, TShape>
  : TNode extends MutationShape
    ? MutationChangeObject<TNode>
  : never

export type MutationChange<TSchema extends MutationSchema = MutationSchema> =
  TSchema extends MutationSchema<infer TShape>
    ? MutationChangeObject<TShape> & {
      reset(): boolean
      writes(): readonly MutationWrite[]
      readonly schema: TSchema
      readonly compiled: CompiledMutationSchema
    }
    : never

export type MutationChangeOptions = {
  reset?: boolean
}

type MutationTargetTrie<TValue> = {
  exact?: TValue
  children?: Map<string, MutationTargetTrie<TValue>>
}

type MutationDictionaryKeyIndex = {
  all: boolean
  keys: Set<string>
}

type MutationSequenceValueIndex = {
  all: boolean
  keys: Set<string>
}

type MutationTreeNodeIndex = {
  all: boolean
  nodeIds: Set<string>
}

type MutationChangeIndex = {
  reset: boolean
  writes: readonly MutationWrite[]
  nodeChanged: Uint8Array
  targetChanged: Map<number, MutationTargetTrie<true>>
  entityTouched: Map<number, MutationTargetTrie<true>>
  entityCreated: Map<number, MutationTargetTrie<true>>
  entityRemoved: Map<number, MutationTargetTrie<true>>
  dictionaryKeys: Map<number, MutationTargetTrie<MutationDictionaryKeyIndex>>
  sequenceValues: Map<number, MutationTargetTrie<MutationSequenceValueIndex>>
  treeNodes: Map<number, MutationTargetTrie<MutationTreeNodeIndex>>
}

const EMPTY_TARGET_PATH: readonly string[] = []

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

const targetPath = (target?: MutationEntityTarget): readonly string[] => target
  ? [...target.scope, target.id]
  : EMPTY_TARGET_PATH

const ensureTargetTrieRoot = <TValue>(
  index: Map<number, MutationTargetTrie<TValue>>,
  nodeId: number
): MutationTargetTrie<TValue> => {
  const existing = index.get(nodeId)
  if (existing) {
    return existing
  }

  const next: MutationTargetTrie<TValue> = {}
  index.set(nodeId, next)
  return next
}

const ensureTargetTrieValue = <TValue>(
  index: Map<number, MutationTargetTrie<TValue>>,
  nodeId: number,
  target: MutationEntityTarget | undefined,
  create: () => TValue
): TValue => {
  let current = ensureTargetTrieRoot(index, nodeId)

  for (const part of targetPath(target)) {
    let next = current.children?.get(part)
    if (!next) {
      if (!current.children) {
        current.children = new Map<string, MutationTargetTrie<TValue>>()
      }
      next = {}
      current.children.set(part, next)
    }
    current = next
  }

  if (current.exact === undefined) {
    current.exact = create()
  }

  return current.exact
}

const readTargetTrieValue = <TValue>(
  index: Map<number, MutationTargetTrie<TValue>>,
  nodeId: number,
  target?: MutationEntityTarget
): TValue | undefined => {
  let current = index.get(nodeId)
  if (!current) {
    return undefined
  }

  for (const part of targetPath(target)) {
    current = current.children?.get(part)
    if (!current) {
      return undefined
    }
  }

  return current.exact
}

const markNodeChanged = (
  bits: Uint8Array,
  nodeId: number
): void => {
  bits[nodeId] = 1
}

const hasNodeChanged = (
  bits: Uint8Array,
  nodeId: number
): boolean => bits[nodeId] === 1

const markTargetChanged = (
  index: Map<number, MutationTargetTrie<true>>,
  nodeId: number,
  target?: MutationEntityTarget
): void => {
  ensureTargetTrieValue(index, nodeId, target, () => true)
}

const hasTargetChanged = (
  index: Map<number, MutationTargetTrie<true>>,
  nodeId: number,
  target?: MutationEntityTarget
): boolean => readTargetTrieValue(index, nodeId, target) === true

const addSequenceKey = (
  keys: Set<string>,
  key: string
): void => {
  keys.add(key)
}

const childTarget = (
  target: MutationEntityTarget | undefined,
  id: string
): MutationEntityTarget => ({
  scope: target
    ? [...target.scope, target.id]
    : [],
  id
})

const writeEntityNodeId = (
  node: CompiledMutationNode
): number | undefined => {
  if (node.kind === 'singleton' || node.kind === 'table' || node.kind === 'map') {
    return node.nodeId
  }

  return node.entityNodeId
}

const createMutationChangeIndex = (
  compiled: CompiledMutationSchema,
  writes: readonly MutationWrite[],
  options?: MutationChangeOptions
): MutationChangeIndex => {
  const index: MutationChangeIndex = {
    reset: options?.reset ?? false,
    writes,
    nodeChanged: new Uint8Array(compiled.nodes.length),
    targetChanged: new Map<number, MutationTargetTrie<true>>(),
    entityTouched: new Map<number, MutationTargetTrie<true>>(),
    entityCreated: new Map<number, MutationTargetTrie<true>>(),
    entityRemoved: new Map<number, MutationTargetTrie<true>>(),
    dictionaryKeys: new Map<number, MutationTargetTrie<MutationDictionaryKeyIndex>>(),
    sequenceValues: new Map<number, MutationTargetTrie<MutationSequenceValueIndex>>(),
    treeNodes: new Map<number, MutationTargetTrie<MutationTreeNodeIndex>>()
  }

  for (const write of writes) {
    markNodeChanged(index.nodeChanged, write.nodeId)
    markTargetChanged(index.targetChanged, write.nodeId, write.target)

    const node = compiled.nodes[write.nodeId]
    if (!node) {
      throw new Error(`Unknown compiled mutation node ${write.nodeId}.`)
    }

    const entityNodeId = writeEntityNodeId(node)
    if (entityNodeId !== undefined) {
      markTargetChanged(index.entityTouched, entityNodeId, write.target)
    }

    switch (write.kind) {
      case 'entity.create':
        markTargetChanged(index.entityCreated, write.nodeId, write.target)
        break

      case 'entity.remove':
        markTargetChanged(index.entityRemoved, write.nodeId, write.target)
        break

      case 'dictionary.set':
      case 'dictionary.delete': {
        const keys = ensureTargetTrieValue(
          index.dictionaryKeys,
          write.nodeId,
          write.target,
          () => ({
            all: false,
            keys: new Set<string>()
          })
        )
        keys.keys.add(write.key)
        break
      }

      case 'dictionary.replace': {
        const keys = ensureTargetTrieValue(
          index.dictionaryKeys,
          write.nodeId,
          write.target,
          () => ({
            all: false,
            keys: new Set<string>()
          })
        )
        keys.all = true
        break
      }

      case 'sequence.insert':
      case 'sequence.move':
      case 'sequence.remove': {
        if (node.kind !== 'sequence') {
          throw new Error(`Sequence write requires a sequence node, received "${node.kind}".`)
        }

        const values = ensureTargetTrieValue(
          index.sequenceValues,
          write.nodeId,
          write.target,
          () => ({
            all: false,
            keys: new Set<string>()
          })
        )
        addSequenceKey(values.keys, node.keyOf(write.value))
        break
      }

      case 'sequence.replace': {
        if (node.kind !== 'sequence') {
          throw new Error(`Sequence write requires a sequence node, received "${node.kind}".`)
        }

        const values = ensureTargetTrieValue(
          index.sequenceValues,
          write.nodeId,
          write.target,
          () => ({
            all: false,
            keys: new Set<string>()
          })
        )
        values.all = true
        values.keys = new Set(write.value.map((item) => node.keyOf(item)))
        break
      }

      case 'tree.insert':
      case 'tree.move':
      case 'tree.remove':
      case 'tree.patch': {
        const nodes = ensureTargetTrieValue(
          index.treeNodes,
          write.nodeId,
          write.target,
          () => ({
            all: false,
            nodeIds: new Set<string>()
          })
        )
        nodes.nodeIds.add(write.treeNodeId)
        break
      }

      case 'tree.replace': {
        const nodes = ensureTargetTrieValue(
          index.treeNodes,
          write.nodeId,
          write.target,
          () => ({
            all: false,
            nodeIds: new Set<string>()
          })
        )
        nodes.all = true
        break
      }
    }
  }

  return index
}

const isFieldChanged = (
  index: MutationChangeIndex,
  nodeId: number,
  target?: MutationEntityTarget
): boolean => index.reset || hasTargetChanged(index.targetChanged, nodeId, target)

const isDictionaryChanged = (
  index: MutationChangeIndex,
  nodeId: number,
  target?: MutationEntityTarget,
  key?: string
): boolean => {
  if (index.reset) {
    return true
  }

  const entry = readTargetTrieValue(index.dictionaryKeys, nodeId, target)
  if (!entry) {
    return false
  }

  if (entry.all) {
    return true
  }

  return key === undefined
    ? entry.keys.size > 0
    : entry.keys.has(key)
}

const isSequenceChanged = (
  index: MutationChangeIndex,
  nodeId: number,
  keyOf: (value: unknown) => string,
  target?: MutationEntityTarget,
  value?: unknown
): boolean => {
  if (index.reset) {
    return true
  }

  const entry = readTargetTrieValue(index.sequenceValues, nodeId, target)
  if (!entry) {
    return false
  }

  if (entry.all) {
    return true
  }

  if (value === undefined) {
    return entry.keys.size > 0
  }

  return entry.keys.has(keyOf(value))
}

const isTreeChanged = (
  index: MutationChangeIndex,
  nodeId: number,
  target?: MutationEntityTarget,
  treeNodeId?: string
): boolean => {
  if (index.reset) {
    return true
  }

  const entry = readTargetTrieValue(index.treeNodes, nodeId, target)
  if (!entry) {
    return false
  }

  if (entry.all) {
    return true
  }

  return treeNodeId === undefined
    ? entry.nodeIds.size > 0
    : entry.nodeIds.has(treeNodeId)
}

const isEntityChanged = (
  index: MutationChangeIndex,
  entityNodeId: number,
  target?: MutationEntityTarget
): boolean => index.reset || hasTargetChanged(index.entityTouched, entityNodeId, target)

const isEntityCreated = (
  index: MutationChangeIndex,
  entityNodeId: number,
  target: MutationEntityTarget
): boolean => !index.reset && hasTargetChanged(index.entityCreated, entityNodeId, target)

const isEntityRemoved = (
  index: MutationChangeIndex,
  entityNodeId: number,
  target: MutationEntityTarget
): boolean => !index.reset && hasTargetChanged(index.entityRemoved, entityNodeId, target)

const createFieldChange = (
  index: MutationChangeIndex,
  nodeId: number,
  target?: MutationEntityTarget
): MutationFieldChange => ({
  changed() {
    return isFieldChanged(index, nodeId, target)
  }
})

const createDictionaryChange = (
  index: MutationChangeIndex,
  nodeId: number,
  target?: MutationEntityTarget
): MutationDictionaryChange<string> => ({
  changed(key?: string) {
    return isDictionaryChanged(index, nodeId, target, key)
  }
})

const createSequenceChange = (
  index: MutationChangeIndex,
  node: import('../compile/schema').CompiledMutationSequenceNode,
  nodeId: number,
  target?: MutationEntityTarget
): MutationSequenceChange<unknown> => ({
  changed(value?: unknown) {
    return isSequenceChanged(index, nodeId, node.keyOf, target, value)
  }
})

const createTreeChange = (
  index: MutationChangeIndex,
  nodeId: number,
  target?: MutationEntityTarget
): MutationTreeChange<string> => ({
  changed(treeNodeId?: string) {
    return isTreeChanged(index, nodeId, target, treeNodeId)
  }
})

const createObjectChange = (
  node: CompiledMutationObjectNode,
  index: MutationChangeIndex,
  target?: MutationEntityTarget
): object => {
  const result: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(node.entries)) {
    defineLazyProperty(result, key, () => createChangeNode(entry, index, target))
  }

  return result
}

const createEntityChange = (
  entityNodeId: number,
  node: CompiledMutationObjectNode,
  index: MutationChangeIndex,
  target?: MutationEntityTarget
): object => Object.assign(
  createObjectChange(node, index, target),
  {
    changed() {
      return isEntityChanged(index, entityNodeId, target)
    }
  }
)

const createSingletonChange = (
  node: CompiledMutationSingletonNode,
  index: MutationChangeIndex,
  target?: MutationEntityTarget
): MutationSingletonChange<MutationShape> => createEntityChange(
  node.nodeId,
  node.entity,
  index,
  target
) as MutationSingletonChange<MutationShape>

const createTableChange = (
  node: CompiledMutationTableNode,
  index: MutationChangeIndex,
  target?: MutationEntityTarget
): MutationTableChange<string, MutationShape> => {
  const entityCache = new Map<string, object>()

  const createEntity = (id: string) => {
    const cached = entityCache.get(id)
    if (cached) {
      return cached
    }

    const next = createEntityChange(
      node.nodeId,
      node.entity,
      index,
      childTarget(target, id)
    )
    entityCache.set(id, next)
    return next
  }

  return Object.assign(
    (id: string) => createEntity(id),
    {
      changed(id?: string) {
        if (id !== undefined) {
          return isEntityChanged(index, node.nodeId, childTarget(target, id))
        }

        return index.reset || hasNodeChanged(index.nodeChanged, node.nodeId)
      },
      created(id: string) {
        return isEntityCreated(index, node.nodeId, childTarget(target, id))
      },
      removed(id: string) {
        return isEntityRemoved(index, node.nodeId, childTarget(target, id))
      }
    }
  ) as MutationTableChange<string, MutationShape>
}

const createMapChange = (
  node: CompiledMutationMapNode,
  index: MutationChangeIndex,
  target?: MutationEntityTarget
): MutationMapChange<string, MutationShape> => {
  const entityCache = new Map<string, object>()

  const createEntity = (id: string) => {
    const cached = entityCache.get(id)
    if (cached) {
      return cached
    }

    const next = createEntityChange(
      node.nodeId,
      node.entity,
      index,
      childTarget(target, id)
    )
    entityCache.set(id, next)
    return next
  }

  return Object.assign(
    (id: string) => createEntity(id),
    {
      changed(id?: string) {
        if (id !== undefined) {
          return isEntityChanged(index, node.nodeId, childTarget(target, id))
        }

        return index.reset || hasNodeChanged(index.nodeChanged, node.nodeId)
      },
      created(id: string) {
        return isEntityCreated(index, node.nodeId, childTarget(target, id))
      },
      removed(id: string) {
        return isEntityRemoved(index, node.nodeId, childTarget(target, id))
      }
    }
  ) as MutationMapChange<string, MutationShape>
}

const createChangeNode = (
  node: CompiledMutationNode,
  index: MutationChangeIndex,
  target?: MutationEntityTarget
): unknown => {
  switch (node.kind) {
    case 'field':
      return createFieldChange(index, node.nodeId, target)
    case 'dictionary':
      return createDictionaryChange(index, node.nodeId, target)
    case 'sequence':
      return createSequenceChange(index, node, node.nodeId, target)
    case 'tree':
      return createTreeChange(index, node.nodeId, target)
    case 'object':
      return createObjectChange(node, index, target)
    case 'singleton':
      return createSingletonChange(node, index, target)
    case 'table':
      return createTableChange(node, index, target)
    case 'map':
      return createMapChange(node, index, target)
  }
}

export const createMutationChange = <TSchema extends MutationSchema>(
  schema: TSchema,
  writes: readonly MutationWrite[] = [],
  options?: MutationChangeOptions
): MutationChange<TSchema> => {
  const compiled = getCompiledMutationSchema(schema)
  const index = createMutationChangeIndex(compiled, writes, options)

  return Object.assign(
    createObjectChange(compiled.root, index),
    {
      schema,
      compiled,
      reset() {
        return index.reset
      },
      writes() {
        return index.writes
      }
    }
  ) as MutationChange<TSchema>
}

export const extendMutationChange = <
  TChange extends object,
  TExtension extends object
>(
  change: TChange,
  extension: TExtension
): TChange & TExtension => {
  for (const key of Object.keys(extension)) {
    if (key in change) {
      throw new Error(`Mutation change extension key "${key}" conflicts with the base change facade.`)
    }
  }

  return Object.assign(change, extension)
}

export const change = createMutationChange
