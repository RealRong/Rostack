import type {
  MutationSchema,
  MutationShape,
  MutationShapeNode,
  MutationSingletonNode,
  MutationTableNode,
  MutationMapNode,
  MutationFieldNode,
  MutationObjectNode,
  MutationDictionaryNode,
  MutationSequenceNode,
  MutationTreeNode
} from '../schema/node'
import {
  readCurrentTargetId,
  readOwnerTargetId,
  scopeTargetId
} from '../internal/state'
import {
  isMutationNode
} from '../schema/node'
import type {
  MutationDeltaBaseOfShape,
  MutationDeltaControls
} from './facadeTypes'
import type {
  MutationOwnerMeta
} from '../schema/meta'
import {
  getNodeMeta
} from '../schema/meta'
import {
  getSchemaChangeFactory
} from '../schema/internals'
import type {
  MutationWrite
} from '../writer/writes'

type MutationDeltaState = {
  reset: boolean
  writes: readonly MutationWrite[]
}

type MutationDeltaCarrier<TSchema extends MutationSchema = MutationSchema> = {
  delta: MutationDelta<TSchema>
}

export type MutationDeltaSource<TSchema extends MutationSchema = MutationSchema> =
  | MutationDelta<TSchema>
  | MutationDeltaCarrier<TSchema>
  | readonly MutationWrite[]

export type MutationDelta<TSchema extends MutationSchema = MutationSchema> =
  TSchema extends MutationSchema<infer TShape, infer TChanges>
    ? MutationDeltaBaseOfShape<TShape> & TChanges
    : never

type MutationObjectContainerNode =
  | MutationObjectNode<MutationShape>
  | MutationSingletonNode<MutationShape>

type MutationCollectionNode =
  | MutationTableNode<string, MutationShape>
  | MutationMapNode<string, MutationShape>

type NodeWriteBuckets = Map<string, readonly MutationWrite[]>

type CollectionTouchBucket = {
  all: boolean
  ids: Set<string>
  created: Set<string>
  removed: Set<string>
}

type MutationDeltaIndex = {
  nodeWrites: WeakMap<MutationShapeNode, NodeWriteBuckets>
  containerTargets: WeakMap<MutationObjectContainerNode, Set<string>>
  collectionTouches: WeakMap<MutationCollectionNode, Map<string, CollectionTouchBucket>>
}

type MutationSchemaDeltaPlan = {
  containerAncestorsByNode: WeakMap<
    MutationShapeNode,
    readonly MutationObjectContainerNode[]
  >
}

type MutationDeltaRuntimeState = MutationDeltaState & {
  schema: MutationSchema
  index: MutationDeltaIndex
  plan: MutationSchemaDeltaPlan
  facadeCache: WeakMap<object, Map<string, unknown>>
}

const ROOT_TARGET_KEY = '__root__'

const deltaStateMap = new WeakMap<object, MutationDeltaRuntimeState>()
const schemaDeltaPlanMap = new WeakMap<MutationSchema, MutationSchemaDeltaPlan>()

const toTargetKey = (
  targetId?: string
): string => targetId ?? ROOT_TARGET_KEY

const ownerNode = (
  owner: MutationOwnerMeta
) => owner.kind === 'document'
  ? undefined
  : owner.node

const pushNodeWrite = (
  buckets: NodeWriteBuckets,
  targetId: string | undefined,
  write: MutationWrite
) => {
  const key = toTargetKey(targetId)
  const list = buckets.get(key)
  if (list) {
    buckets.set(key, [
      ...list,
      write
    ])
    return
  }
  buckets.set(key, [write])
}

const getOrCreateMapValue = <TKey extends object, TValue>(
  map: WeakMap<TKey, TValue>,
  key: TKey,
  create: () => TValue
): TValue => {
  const existing = map.get(key)
  if (existing) {
    return existing
  }

  const value = create()
  map.set(key, value)
  return value
}

const getOrCreateRecordValue = <TValue>(
  map: Map<string, TValue>,
  key: string,
  create: () => TValue
): TValue => {
  const existing = map.get(key)
  if (existing) {
    return existing
  }

  const value = create()
  map.set(key, value)
  return value
}

const indexShapeContainers = (
  shape: MutationShape,
  plan: MutationSchemaDeltaPlan,
  ancestors: readonly MutationObjectContainerNode[]
) => {
  Object.values(shape).forEach((entry) => {
    if (!isMutationNode(entry)) {
      indexShapeContainers(entry as MutationShape, plan, ancestors)
      return
    }

    plan.containerAncestorsByNode.set(entry, ancestors)

    switch (entry.kind) {
      case 'object':
        indexShapeContainers(entry.shape, plan, [
          ...ancestors,
          entry
        ])
        break
      case 'singleton':
        indexShapeContainers(entry.shape, plan, [
          ...ancestors,
          entry
        ])
        break
      case 'table':
      case 'map':
        indexShapeContainers(entry.shape, plan, ancestors)
        break
      case 'field':
      case 'dictionary':
      case 'sequence':
      case 'tree':
        break
    }
  })
}

const getSchemaDeltaPlan = (
  schema: MutationSchema
): MutationSchemaDeltaPlan => {
  const cached = schemaDeltaPlanMap.get(schema)
  if (cached) {
    return cached
  }

  const plan: MutationSchemaDeltaPlan = {
    containerAncestorsByNode: new WeakMap()
  }
  indexShapeContainers(schema.shape, plan, [])
  schemaDeltaPlanMap.set(schema, plan)
  return plan
}

const createMutationDeltaIndex = (
  schema: MutationSchema,
  writes: readonly MutationWrite[]
): MutationDeltaIndex => {
  const plan = getSchemaDeltaPlan(schema)
  const index: MutationDeltaIndex = {
    nodeWrites: new WeakMap(),
    containerTargets: new WeakMap(),
    collectionTouches: new WeakMap()
  }

  writes.forEach((write) => {
    const nodeBuckets = getOrCreateMapValue(index.nodeWrites, write.node, () => new Map())
    pushNodeWrite(nodeBuckets, write.targetId, write)

    const containerAncestors = plan.containerAncestorsByNode.get(write.node) ?? []
    containerAncestors.forEach((container) => {
      const targets = getOrCreateMapValue(index.containerTargets, container, () => new Set())
      targets.add(toTargetKey(write.targetId))
    })

    const meta = getNodeMeta(write.node)
    const collection = (
      write.node.kind === 'table' || write.node.kind === 'map'
    )
      ? write.node
      : ownerNode(meta.owner)

    if (collection?.kind !== 'table' && collection?.kind !== 'map') {
      return
    }

    const bucketMap = getOrCreateMapValue(index.collectionTouches, collection, () => new Map())
    const bucket = getOrCreateRecordValue(
      bucketMap,
      toTargetKey(readOwnerTargetId(write.targetId)),
      () => ({
        all: false,
        ids: new Set(),
        created: new Set(),
        removed: new Set()
      })
    )

    const localId = readCurrentTargetId(write.targetId)
    if (!localId) {
      bucket.all = true
      return
    }

    bucket.ids.add(localId)
    if (write.kind === 'entity.create') {
      bucket.created.add(localId)
    }
    if (write.kind === 'entity.remove') {
      bucket.removed.add(localId)
    }
  })

  return index
}

const isDelta = (
  value: unknown
): value is MutationDelta => Boolean(
  value
  && typeof value === 'object'
  && typeof (value as Record<string, unknown>).reset === 'function'
  && typeof (value as Record<string, unknown>).writes === 'function'
  && deltaStateMap.has(value as object)
)

const hasDelta = (
  value: unknown
): value is MutationDeltaCarrier => Boolean(
  value
  && typeof value === 'object'
  && 'delta' in (value as Record<string, unknown>)
  && isDelta((value as MutationDeltaCarrier).delta)
)

const readDeltaState = (
  delta: MutationDelta
): MutationDeltaRuntimeState => {
  const state = deltaStateMap.get(delta as object)
  if (!state) {
    throw new Error('Mutation delta was not created by @shared/mutation.')
  }
  return state
}

export const resolveMutationDeltaSource = <TSchema extends MutationSchema>(
  schema: TSchema,
  input?: MutationDeltaSource<TSchema>
): MutationDeltaState => {
  if (input === undefined) {
    return {
      reset: false,
      writes: []
    }
  }

  if (Array.isArray(input)) {
    return {
      reset: false,
      writes: input
    }
  }

  if (isDelta(input)) {
    const state = readDeltaState(input)
    if (state.schema !== schema) {
      throw new Error('Mutation delta source belongs to a different schema.')
    }
    return {
      reset: state.reset,
      writes: state.writes
    }
  }

  if (hasDelta(input)) {
    return resolveMutationDeltaSource(schema, input.delta as MutationDelta<TSchema>)
  }

  throw new Error('Unsupported mutation delta source.')
}

const getNodeTargetWrites = (
  state: MutationDeltaRuntimeState,
  node: MutationShapeNode,
  targetId?: string
): readonly MutationWrite[] => {
  const buckets = state.index.nodeWrites.get(node)
  if (!buckets) {
    return []
  }

  if (targetId !== undefined) {
    return buckets.get(toTargetKey(targetId)) ?? []
  }

  return [...buckets.values()].flat()
}

const nodeChanged = (
  state: MutationDeltaRuntimeState,
  node: MutationShapeNode,
  targetId?: string
): boolean => {
  const buckets = state.index.nodeWrites.get(node)
  if (!buckets) {
    return false
  }

  if (targetId !== undefined) {
    return (buckets.get(toTargetKey(targetId))?.length ?? 0) > 0
  }

  for (const writes of buckets.values()) {
    if (writes.length > 0) {
      return true
    }
  }
  return false
}

const containerChanged = (
  state: MutationDeltaRuntimeState,
  node: MutationObjectContainerNode,
  targetId?: string
): boolean => {
  const targets = state.index.containerTargets.get(node)
  if (!targets) {
    return false
  }

  if (targetId !== undefined) {
    return targets.has(toTargetKey(targetId))
  }

  return targets.size > 0
}

const getCachedFacade = <TValue>(
  state: MutationDeltaRuntimeState,
  key: object,
  targetId: string | undefined,
  create: () => TValue
): TValue => {
  const keyMap = getOrCreateMapValue(state.facadeCache, key, () => new Map())
  const cacheKey = toTargetKey(targetId)
  if (keyMap.has(cacheKey)) {
    return keyMap.get(cacheKey) as TValue
  }

  const value = create()
  keyMap.set(cacheKey, value)
  return value
}

const defineLazyNode = (
  target: Record<string, unknown>,
  key: string,
  resolve: () => unknown
) => {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get() {
      const value = resolve()
      Object.defineProperty(target, key, {
        value,
        configurable: false,
        enumerable: true,
        writable: false
      })
      return value
    }
  })
}

const createFieldDelta = (
  node: MutationFieldNode<unknown, boolean>,
  state: MutationDeltaRuntimeState,
  targetId?: string
) => getCachedFacade(state, node, targetId, () => ({
  changed: () => nodeChanged(state, node, targetId)
}))

const createDictionaryDelta = (
  node: MutationDictionaryNode<string, unknown>,
  state: MutationDeltaRuntimeState,
  targetId?: string
) => getCachedFacade(state, node, targetId, () => ({
  changed: (key?: string) => {
    const writes = getNodeTargetWrites(state, node, targetId)
    if (key === undefined) {
      return writes.length > 0
    }
    return writes.some((write) => (
      (write.kind === 'dictionary.set' || write.kind === 'dictionary.delete')
        ? write.key === key
        : write.kind === 'dictionary.replace'
          ? key in write.value
          : false
    ))
  },
  anyChanged: () => nodeChanged(state, node, targetId),
  has: (key: string) => getNodeTargetWrites(state, node, targetId).some((write) => (
    write.kind === 'dictionary.set' && write.key === key
    || write.kind === 'dictionary.replace' && key in write.value
  ))
}))

const createSequenceDelta = (
  node: MutationSequenceNode<unknown>,
  state: MutationDeltaRuntimeState,
  targetId?: string
) => getCachedFacade(state, node, targetId, () => ({
  changed: () => nodeChanged(state, node, targetId),
  orderChanged: () => nodeChanged(state, node, targetId),
  contains: (item: unknown) => getNodeTargetWrites(state, node, targetId).some((write) => (
    (
      write.kind === 'sequence.insert'
      || write.kind === 'sequence.move'
      || write.kind === 'sequence.remove'
    )
      ? node.keyOf(write.value) === node.keyOf(item)
      : write.kind === 'sequence.replace'
        ? write.value.some((entry) => node.keyOf(entry) === node.keyOf(item))
        : false
  ))
}))

const createTreeDelta = (
  node: MutationTreeNode<string, unknown>,
  state: MutationDeltaRuntimeState,
  targetId?: string
) => getCachedFacade(state, node, targetId, () => ({
  changed: () => nodeChanged(state, node, targetId),
  structureChanged: () => getNodeTargetWrites(state, node, targetId).some((write) => write.kind !== 'tree.patch'),
  nodeChanged: (nodeId: string) => getNodeTargetWrites(state, node, targetId).some((write) => (
    ('nodeId' in write && write.nodeId === nodeId)
    || write.kind === 'tree.replace'
  ))
}))

const populateShapeDelta = (
  target: Record<string, unknown>,
  shape: MutationShape,
  state: MutationDeltaRuntimeState,
  targetId?: string
) => {
  Object.entries(shape).forEach(([key, entry]) => {
    defineLazyNode(target, key, () => createNodeDelta(
      entry as MutationShapeNode | MutationShape,
      state,
      targetId
    ))
  })
}

const createShapeDelta = (
  shape: MutationShape,
  state: MutationDeltaRuntimeState,
  targetId?: string
): Record<string, unknown> => getCachedFacade(state, shape, targetId, () => {
  const value: Record<string, unknown> = {}
  populateShapeDelta(value, shape, state, targetId)
  return value
})

const createObjectDelta = (
  node: MutationObjectNode<MutationShape> | MutationSingletonNode<MutationShape>,
  state: MutationDeltaRuntimeState,
  targetId?: string
) => getCachedFacade(state, node, targetId, () => {
  const value: Record<string, unknown> = {}
  populateShapeDelta(value, node.shape, state, targetId)
  Object.defineProperty(value, 'changed', {
    value: () => nodeChanged(state, node, targetId) || containerChanged(state, node, targetId),
    configurable: false,
    enumerable: true,
    writable: false
  })
  return value
})

const createCollectionDelta = (
  node: MutationTableNode<string, MutationShape> | MutationMapNode<string, MutationShape>,
  state: MutationDeltaRuntimeState,
  ownerTargetId?: string
) => getCachedFacade(state, node, ownerTargetId, () => {
  const entityCache = new Map<string, unknown>()
  const bucket = state.index.collectionTouches.get(node)?.get(toTargetKey(ownerTargetId))

  const readEntity = (id: string) => {
    const existing = entityCache.get(id)
    if (existing !== undefined) {
      return existing
    }

    const scopedTargetId = scopeTargetId(ownerTargetId, id)
    const value: Record<string, unknown> = {}
    populateShapeDelta(value, node.shape, state, scopedTargetId)
    Object.defineProperty(value, 'changed', {
      value: () => bucket?.all === true || bucket?.ids.has(id) === true,
      configurable: false,
      enumerable: true,
      writable: false
    })
    entityCache.set(id, value)
    return value
  }

  return Object.assign(
    (id: string) => readEntity(id),
    {
      changed: (id?: string) => {
        if (!bucket) {
          return false
        }
        return id === undefined
          ? bucket.all || bucket.ids.size > 0
          : bucket.all || bucket.ids.has(id)
      },
      created: (id: string) => bucket?.all === true || bucket?.created.has(id) === true,
      removed: (id: string) => bucket?.all === true || bucket?.removed.has(id) === true,
      contains: (id: string) => bucket?.all === true || bucket?.ids.has(id) === true,
      touchedIds: () => {
        if (!bucket) {
          return new Set<string>()
        }
        if (bucket.all) {
          return 'all'
        }
        return new Set(bucket.ids)
      }
    }
  )
})

const createNodeDelta = (
  entry: MutationShapeNode | MutationShape,
  state: MutationDeltaRuntimeState,
  targetId?: string
): unknown => {
  if (!isMutationNode(entry)) {
    return createShapeDelta(entry, state, targetId)
  }

  switch (entry.kind) {
    case 'field':
      return createFieldDelta(entry, state, targetId)
    case 'dictionary':
      return createDictionaryDelta(entry, state, targetId)
    case 'sequence':
      return createSequenceDelta(entry, state, targetId)
    case 'tree':
      return createTreeDelta(entry, state, targetId)
    case 'object':
      return createObjectDelta(entry, state, targetId)
    case 'singleton':
      return createObjectDelta(entry, state, targetId)
    case 'table':
    case 'map':
      return createCollectionDelta(entry, state, targetId)
  }
}

export const createMutationDeltaFromState = <TSchema extends MutationSchema>(
  schema: TSchema,
  state: MutationDeltaState
): MutationDelta<TSchema> => {
  const runtimeState: MutationDeltaRuntimeState = {
    ...state,
    schema,
    plan: getSchemaDeltaPlan(schema),
    index: createMutationDeltaIndex(schema, state.writes),
    facadeCache: new WeakMap()
  }
  const controls = {
    reset: () => runtimeState.reset,
    writes: () => [...runtimeState.writes]
  } satisfies MutationDeltaControls
  const base = Object.assign(
    createShapeDelta(schema.shape, runtimeState),
    controls
  ) as MutationDeltaBaseOfShape<typeof schema.shape>
  const aggregates = getSchemaChangeFactory(schema)?.(base)
  const delta = Object.assign(base, aggregates ?? {}) as MutationDelta<TSchema>

  deltaStateMap.set(delta as object, runtimeState)

  return delta
}

export const createMutationDelta = <TSchema extends MutationSchema>(
  schema: TSchema,
  input?: MutationDeltaSource<TSchema>
): MutationDelta<TSchema> => {
  if (input !== undefined && isDelta(input)) {
    const state = readDeltaState(input)
    if (state.schema === schema) {
      return input as MutationDelta<TSchema>
    }
  }

  return createMutationDeltaFromState(
    schema,
    resolveMutationDeltaSource(schema, input)
  )
}

export const createMutationResetDelta = <TSchema extends MutationSchema>(
  schema: TSchema
): MutationDelta<TSchema> => createMutationDeltaFromState(schema, {
  reset: true,
  writes: []
})
