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
  isMutationGroup,
  isMutationNode
} from '../schema/node'
import type {
  MutationOwnerMeta
} from '../schema/meta'
import type {
  MutationDocumentKeys,
  MutationHasDocumentMembers,
  MutationNamespaceKeys
} from '../schema/facadeTypes'
import {
  getNodeMeta
} from '../schema/meta'
import type {
  MutationWrite
} from '../writer/writes'

export type MutationDeltaInput = {
  reset?: true
  writes?: readonly MutationWrite[]
}

export type MutationDeltaSource =
  | MutationDeltaInput
  | readonly MutationWrite[]

type MutationFieldDelta = {
  changed(): boolean
}

type MutationDictionaryDelta<TKey extends string> = {
  changed(key?: TKey): boolean
  anyChanged(): boolean
  has(key: TKey): boolean
}

type MutationSequenceDelta<TItem extends string> = {
  changed(): boolean
  orderChanged(): boolean
  contains(item: TItem): boolean
}

type MutationTreeDelta<TNodeId extends string> = {
  changed(): boolean
  structureChanged(): boolean
  nodeChanged(nodeId: TNodeId): boolean
}

type MutationObjectDelta<TShape extends MutationShape> = MutationDeltaDocument<TShape> & {
  changed(): boolean
}

type MutationCollectionDelta<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationObjectDelta<TShape>) & {
  changed(id?: TId): boolean
  created(id: TId): boolean
  removed(id: TId): boolean
}

type MutationDeltaNode<TNode> =
  TNode extends MutationFieldNode<any> ? MutationFieldDelta
  : TNode extends MutationObjectNode<infer TShape> ? MutationObjectDelta<TShape>
  : TNode extends MutationDictionaryNode<infer TKey extends string, any>
    ? MutationDictionaryDelta<TKey>
  : TNode extends MutationSequenceNode<infer TItem extends string>
    ? MutationSequenceDelta<TItem>
  : TNode extends MutationTreeNode<infer TNodeId extends string, any>
    ? MutationTreeDelta<TNodeId>
  : TNode extends MutationSingletonNode<infer TShape>
    ? MutationObjectDelta<TShape>
  : TNode extends MutationTableNode<infer TId extends string, infer TShape>
    ? MutationCollectionDelta<TId, TShape>
  : TNode extends MutationMapNode<infer TId extends string, infer TShape>
    ? MutationCollectionDelta<TId, TShape>
  : TNode extends MutationShape
    ? MutationDeltaNamespace<TNode>
  : never

type MutationDeltaDocument<TShape extends MutationShape> = {
  readonly [K in MutationDocumentKeys<TShape>]: MutationDeltaNode<TShape[K]>
}

type MutationDeltaNamespace<TShape extends MutationShape> = {
  readonly [K in MutationNamespaceKeys<TShape>]: MutationDeltaNode<TShape[K]>
} & (
  MutationHasDocumentMembers<TShape> extends false
    ? {}
    : {
        document: MutationDeltaDocument<TShape>
      }
)

export type MutationDelta<TSchema extends MutationSchema = MutationSchema> =
  TSchema extends MutationSchema<infer TShape>
    ? MutationDeltaNamespace<TShape> & {
        reset(): boolean
        writes(): readonly MutationWrite[]
      }
    : never

const normalizeSource = (
  input: MutationDeltaSource
): MutationDeltaInput => Array.isArray(input)
  ? {
      writes: input
    }
  : input as MutationDeltaInput

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

const createObjectDelta = (
  node: MutationObjectNode<MutationShape>,
  writes: readonly MutationWrite[],
  targetId?: string
) => {
  const pathKey = getNodeMeta(node).path.join('.')
  return {
    ...createDocumentDelta(node.shape, writes, targetId),
    changed: () => descendantChanged(pathKey, writes, targetId)
  }
}

const createCollectionDelta = (
  node: MutationTableNode<string, MutationShape> | MutationMapNode<string, MutationShape>,
  writes: readonly MutationWrite[]
) => Object.assign(
  (id: string) => ({
    ...createDocumentDelta(node.shape, writes, id),
    changed: () => writes.some((write) => (
      (write.targetId === id)
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
    ) && (id === undefined || write.targetId === id)),
    created: (id: string) => writes.some((write) => (
      write.kind === 'entity.create'
      && write.node === node
      && write.targetId === id
    )),
    removed: (id: string) => writes.some((write) => (
      write.kind === 'entity.remove'
      && write.node === node
      && write.targetId === id
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
        ...createDocumentDelta(entry.shape, writes, targetId),
        changed: () => writes.some((write) => (
          write.node === entry
          || ownerNode(getNodeMeta(write.node).owner) === entry
        ))
      }
    case 'table':
    case 'map':
      return createCollectionDelta(entry, writes)
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

export const createMutationDelta = <TSchema extends MutationSchema>(
  schema: TSchema,
  input: MutationDeltaSource
): MutationDelta<TSchema> => {
  const normalized = normalizeSource(input)
  const writes = normalized.writes ?? []
  const delta = createNamespaceDelta(schema.shape, writes) as MutationDelta<TSchema>
  return Object.assign(delta, {
    reset: () => normalized.reset === true,
    writes: () => [...writes]
  })
}
