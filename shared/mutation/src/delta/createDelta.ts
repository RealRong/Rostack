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
  scopeTargetId
} from '../internal/state'
import {
  isMutationGroup,
  isMutationNode
} from '../schema/node'
import type {
  MutationDeltaBaseOfShape,
  MutationDeltaShape,
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

const deltaStateMap = new WeakMap<object, MutationDeltaState & {
  schema: MutationSchema
}>()

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
): MutationDeltaState & {
  schema: MutationSchema
} => {
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

const ownerNode = (
  owner: MutationOwnerMeta
) => owner.kind === 'document'
  ? undefined
  : owner.node

const nodeChanged = (
  node: MutationShapeNode,
  writes: readonly MutationWrite[],
  targetId?: string
): boolean => writes.some((write) => (
  write.node === node
  && (targetId === undefined || write.targetId === targetId)
))

const descendantChanged = (
  pathKey: string,
  writes: readonly MutationWrite[],
  targetId?: string
): boolean => writes.some((write) => (
  getNodeMeta(write.node).path.join('.').startsWith(pathKey)
  && (targetId === undefined || write.targetId === targetId)
))

const createFieldDelta = (
  node: MutationFieldNode<unknown>,
  writes: readonly MutationWrite[],
  targetId?: string
) => ({
  changed: () => nodeChanged(node, writes, targetId)
})

const createDictionaryDelta = (
  node: MutationDictionaryNode<string, unknown>,
  writes: readonly MutationWrite[],
  targetId?: string
) => ({
  changed: (key?: string) => writes.some((write) => (
    write.node === node
    && (targetId === undefined || write.targetId === targetId)
    && (
      key === undefined
      || (
        (write.kind === 'dictionary.set' || write.kind === 'dictionary.delete')
        && write.key === key
      )
      || write.kind === 'dictionary.replace'
    )
  )),
  anyChanged: () => nodeChanged(node, writes, targetId),
  has: (key: string) => writes.some((write) => (
    write.node === node
    && (targetId === undefined || write.targetId === targetId)
    && (
      (write.kind === 'dictionary.set' && write.key === key)
      || write.kind === 'dictionary.replace'
    )
  ))
})

const createSequenceDelta = (
  node: MutationSequenceNode<string>,
  writes: readonly MutationWrite[],
  targetId?: string
) => ({
  changed: () => nodeChanged(node, writes, targetId),
  orderChanged: () => nodeChanged(node, writes, targetId),
  contains: (item: string) => writes.some((write) => (
    write.node === node
    && (targetId === undefined || write.targetId === targetId)
    && (
      (write.kind === 'sequence.insert' || write.kind === 'sequence.move' || write.kind === 'sequence.remove')
      && write.value === item
      || write.kind === 'sequence.replace' && write.value.includes(item)
    )
  ))
})

const createTreeDelta = (
  node: MutationTreeNode<string, unknown>,
  writes: readonly MutationWrite[],
  targetId?: string
) => ({
  changed: () => nodeChanged(node, writes, targetId),
  structureChanged: () => writes.some((write) => (
    write.node === node
    && (targetId === undefined || write.targetId === targetId)
    && write.kind !== 'tree.patch'
  )),
  nodeChanged: (nodeId: string) => writes.some((write) => (
    write.node === node
    && (targetId === undefined || write.targetId === targetId)
    && (
      ('nodeId' in write && write.nodeId === nodeId)
      || write.kind === 'tree.replace'
    )
  ))
})

const createDocumentDelta = (
  shape: MutationShape,
  writes: readonly MutationWrite[],
  targetId?: string
) => Object.fromEntries(
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
      createNodeDelta(value as MutationShapeNode, writes, targetId)
    ])
)

const createShapeDelta = (
  shape: MutationShape,
  writes: readonly MutationWrite[],
  targetId?: string
): Record<string, unknown> => Object.fromEntries(
  Object.entries(shape)
    .map(([key, value]) => [
      key,
      createNodeDelta(value as MutationShapeNode | MutationShape, writes, targetId)
    ])
)

const createObjectDelta = (
  node: MutationObjectNode<MutationShape>,
  writes: readonly MutationWrite[],
  targetId?: string
) => {
  const pathKey = getNodeMeta(node).path.join('.')
  return {
    ...createShapeDelta(node.shape, writes, targetId),
    changed: () => descendantChanged(pathKey, writes, targetId)
  }
}

const createCollectionDelta = (
  node: MutationTableNode<string, MutationShape> | MutationMapNode<string, MutationShape>,
  writes: readonly MutationWrite[],
  ownerTargetId?: string
) => Object.assign(
  (id: string) => ({
    ...createShapeDelta(node.shape, writes, scopeTargetId(ownerTargetId, id)),
    changed: () => writes.some((write) => (
      (write.targetId === scopeTargetId(ownerTargetId, id))
      && (
        write.node === node
        || ownerNode(getNodeMeta(write.node).owner) === node
      )
    ))
  }),
  {
    changed: (id?: string) => writes.some((write) => (
      write.node === node
      || ownerNode(getNodeMeta(write.node).owner) === node
    ) && (id === undefined || write.targetId === scopeTargetId(ownerTargetId, id))),
    created: (id: string) => writes.some((write) => (
      write.kind === 'entity.create'
      && write.node === node
      && write.targetId === scopeTargetId(ownerTargetId, id)
    )),
    removed: (id: string) => writes.some((write) => (
      write.kind === 'entity.remove'
      && write.node === node
      && write.targetId === scopeTargetId(ownerTargetId, id)
    )),
    contains: (id: string) => writes.some((write) => (
      write.targetId === scopeTargetId(ownerTargetId, id)
      && (
        write.node === node
        || ownerNode(getNodeMeta(write.node).owner) === node
      )
    ))
  }
)

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

const createNodeDelta = (
  entry: MutationShapeNode | MutationShape,
  writes: readonly MutationWrite[],
  targetId?: string
): unknown => {
  if (!isMutationNode(entry)) {
    return createNamespaceDelta(entry, writes, targetId)
  }

  switch (entry.kind) {
    case 'field':
      return createFieldDelta(entry, writes, targetId)
    case 'dictionary':
      return createDictionaryDelta(entry, writes, targetId)
    case 'sequence':
      return createSequenceDelta(entry as MutationSequenceNode<string>, writes, targetId)
    case 'tree':
      return createTreeDelta(entry as MutationTreeNode<string, unknown>, writes, targetId)
    case 'object':
      return createObjectDelta(entry, writes, targetId)
    case 'singleton':
      return {
        ...createShapeDelta(entry.shape, writes, targetId),
        changed: () => writes.some((write) => (
          write.node === entry
          || ownerNode(getNodeMeta(write.node).owner) === entry
        ))
      }
    case 'table':
    case 'map':
      return createCollectionDelta(entry, writes, targetId)
  }
}

const createNamespaceDelta = (
  shape: MutationShape,
  writes: readonly MutationWrite[],
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
        createNodeDelta(value, writes, targetId)
      ])
  )

  if (!hasDocumentMembers(shape)) {
    return namespace
  }

  return {
    ...namespace,
    document: createDocumentDelta(shape, writes, targetId)
  }
}

export const createMutationDeltaFromState = <TSchema extends MutationSchema>(
  schema: TSchema,
  state: MutationDeltaState
): MutationDelta<TSchema> => {
  const writes = state.writes
  const controls = {
    reset: () => state.reset,
    writes: () => [...writes]
  } satisfies MutationDeltaControls
  const base = Object.assign(
    createNamespaceDelta(schema.shape, writes),
    controls
  ) as MutationDeltaBaseOfShape<typeof schema.shape> & MutationDeltaShape<typeof schema.shape>
  const aggregates = getSchemaChangeFactory(schema)?.(base)
  const delta = Object.assign(base, aggregates ?? {}) as MutationDelta<TSchema>

  deltaStateMap.set(delta as object, {
    schema,
    reset: state.reset,
    writes
  })

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
