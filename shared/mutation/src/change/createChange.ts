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

const targetsEqual = (
  left?: MutationEntityTarget,
  right?: MutationEntityTarget
): boolean => {
  if (!left && !right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  if (left.id !== right.id || left.scope.length !== right.scope.length) {
    return false
  }

  for (let index = 0; index < left.scope.length; index += 1) {
    if (left.scope[index] !== right.scope[index]) {
      return false
    }
  }

  return true
}

const writeBelongsToEntity = (
  compiled: CompiledMutationSchema,
  write: MutationWrite,
  entityNodeId: number,
  target?: MutationEntityTarget
): boolean => {
  if (!targetsEqual(write.target, target)) {
    return false
  }

  const node = compiled.nodes[write.nodeId]
  if (!node) {
    return false
  }

  return write.nodeId === entityNodeId || node.entityNodeId === entityNodeId
}

const createFieldChange = (
  nodeId: number,
  writes: readonly MutationWrite[],
  target?: MutationEntityTarget
): MutationFieldChange => ({
  changed() {
    return writes.some((write) => write.kind === 'field.set' && write.nodeId === nodeId && targetsEqual(write.target, target))
  }
})

const createDictionaryChange = (
  nodeId: number,
  writes: readonly MutationWrite[],
  target?: MutationEntityTarget
): MutationDictionaryChange<string> => ({
  changed(key?: string) {
    return writes.some((write) => {
      if (write.nodeId !== nodeId || !targetsEqual(write.target, target)) {
        return false
      }

      if (write.kind === 'dictionary.replace') {
        return true
      }

      if (write.kind !== 'dictionary.set' && write.kind !== 'dictionary.delete') {
        return false
      }

      return key === undefined || write.key === key
    })
  }
})

const createSequenceChange = (
  nodeId: number,
  writes: readonly MutationWrite[],
  target?: MutationEntityTarget
): MutationSequenceChange<unknown> => ({
  changed(value?: unknown) {
    return writes.some((write) => {
      if (write.nodeId !== nodeId || !targetsEqual(write.target, target)) {
        return false
      }

      if (write.kind === 'sequence.replace') {
        return value === undefined || write.value.includes(value)
      }

      if (
        write.kind !== 'sequence.insert'
        && write.kind !== 'sequence.move'
        && write.kind !== 'sequence.remove'
      ) {
        return false
      }

      return value === undefined || Object.is(write.value, value)
    })
  }
})

const createTreeChange = (
  nodeId: number,
  writes: readonly MutationWrite[],
  target?: MutationEntityTarget
): MutationTreeChange<string> => ({
  changed(treeNodeId?: string) {
    return writes.some((write) => {
      if (write.nodeId !== nodeId || !targetsEqual(write.target, target)) {
        return false
      }

      if (write.kind === 'tree.replace') {
        return true
      }

      if (
        write.kind !== 'tree.insert'
        && write.kind !== 'tree.move'
        && write.kind !== 'tree.remove'
        && write.kind !== 'tree.patch'
      ) {
        return false
      }

      return treeNodeId === undefined || write.treeNodeId === treeNodeId
    })
  }
})

const createObjectChange = (
  compiled: CompiledMutationSchema,
  node: CompiledMutationObjectNode,
  writes: readonly MutationWrite[],
  target?: MutationEntityTarget
): object => {
  const result: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(node.entries)) {
    defineLazyProperty(result, key, () => createChangeNode(compiled, entry, writes, target))
  }

  return result
}

const createEntityChange = (
  compiled: CompiledMutationSchema,
  entityNodeId: number,
  node: CompiledMutationObjectNode,
  writes: readonly MutationWrite[],
  target?: MutationEntityTarget
): object => Object.assign(
  createObjectChange(compiled, node, writes, target),
  {
    changed() {
      return writes.some((write) => writeBelongsToEntity(compiled, write, entityNodeId, target))
    }
  }
)

const createSingletonChange = (
  compiled: CompiledMutationSchema,
  node: CompiledMutationSingletonNode,
  writes: readonly MutationWrite[],
  target?: MutationEntityTarget
): MutationSingletonChange<MutationShape> => createEntityChange(
  compiled,
  node.nodeId,
  node.entity,
  writes,
  target
) as MutationSingletonChange<MutationShape>

const createTableChange = (
  compiled: CompiledMutationSchema,
  node: CompiledMutationTableNode,
  writes: readonly MutationWrite[],
  target?: MutationEntityTarget
): MutationTableChange<string, MutationShape> => {
  const entityCache = new Map<string, object>()
  const ownerScope = target
    ? [...target.scope, target.id]
    : []

  const createEntity = (id: string) => {
    const cached = entityCache.get(id)
    if (cached) {
      return cached
    }

    const next = createEntityChange(
      compiled,
      node.nodeId,
      node.entity,
      writes,
      {
        scope: ownerScope,
        id
      }
    )
    entityCache.set(id, next)
    return next
  }

  return Object.assign(
    (id: string) => createEntity(id),
    {
      changed(id?: string) {
        if (id !== undefined) {
          return writes.some((write) => writeBelongsToEntity(
            compiled,
            write,
            node.nodeId,
            {
              scope: ownerScope,
              id
            }
          ))
        }

        return writes.some((write) => {
          if (write.nodeId !== node.nodeId) {
            return false
          }
          return write.kind === 'entity.create'
            || write.kind === 'entity.replace'
            || write.kind === 'entity.remove'
            || write.kind === 'entity.move'
        })
      },
      created(id: string) {
        return writes.some((write) =>
          write.kind === 'entity.create'
          && write.nodeId === node.nodeId
          && targetsEqual(write.target, {
            scope: ownerScope,
            id
          })
        )
      },
      removed(id: string) {
        return writes.some((write) =>
          write.kind === 'entity.remove'
          && write.nodeId === node.nodeId
          && targetsEqual(write.target, {
            scope: ownerScope,
            id
          })
        )
      }
    }
  ) as MutationTableChange<string, MutationShape>
}

const createMapChange = (
  compiled: CompiledMutationSchema,
  node: CompiledMutationMapNode,
  writes: readonly MutationWrite[],
  target?: MutationEntityTarget
): MutationMapChange<string, MutationShape> => {
  const entityCache = new Map<string, object>()
  const ownerScope = target
    ? [...target.scope, target.id]
    : []

  const createEntity = (id: string) => {
    const cached = entityCache.get(id)
    if (cached) {
      return cached
    }

    const next = createEntityChange(
      compiled,
      node.nodeId,
      node.entity,
      writes,
      {
        scope: ownerScope,
        id
      }
    )
    entityCache.set(id, next)
    return next
  }

  return Object.assign(
    (id: string) => createEntity(id),
    {
      changed(id?: string) {
        if (id !== undefined) {
          return writes.some((write) => writeBelongsToEntity(
            compiled,
            write,
            node.nodeId,
            {
              scope: ownerScope,
              id
            }
          ))
        }

        return writes.some((write) => {
          if (write.nodeId !== node.nodeId) {
            return false
          }
          return write.kind === 'entity.create'
            || write.kind === 'entity.replace'
            || write.kind === 'entity.remove'
        })
      },
      created(id: string) {
        return writes.some((write) =>
          write.kind === 'entity.create'
          && write.nodeId === node.nodeId
          && targetsEqual(write.target, {
            scope: ownerScope,
            id
          })
        )
      },
      removed(id: string) {
        return writes.some((write) =>
          write.kind === 'entity.remove'
          && write.nodeId === node.nodeId
          && targetsEqual(write.target, {
            scope: ownerScope,
            id
          })
        )
      }
    }
  ) as MutationMapChange<string, MutationShape>
}

const createChangeNode = (
  compiled: CompiledMutationSchema,
  node: CompiledMutationNode,
  writes: readonly MutationWrite[],
  target?: MutationEntityTarget
): unknown => {
  switch (node.kind) {
    case 'field':
      return createFieldChange(node.nodeId, writes, target)
    case 'dictionary':
      return createDictionaryChange(node.nodeId, writes, target)
    case 'sequence':
      return createSequenceChange(node.nodeId, writes, target)
    case 'tree':
      return createTreeChange(node.nodeId, writes, target)
    case 'object':
      return createObjectChange(compiled, node, writes, target)
    case 'singleton':
      return createSingletonChange(compiled, node, writes, target)
    case 'table':
      return createTableChange(compiled, node, writes, target)
    case 'map':
      return createMapChange(compiled, node, writes, target)
  }
}

export const createMutationChange = <TSchema extends MutationSchema>(
  schema: TSchema,
  writes: readonly MutationWrite[] = []
): MutationChange<TSchema> => Object.assign(
  createObjectChange(getCompiledMutationSchema(schema), getCompiledMutationSchema(schema).root, writes),
  {
    schema,
    compiled: getCompiledMutationSchema(schema),
    reset() {
      return false
    },
    writes() {
      return writes
    }
  }
) as MutationChange<TSchema>

export const extendMutationChange = <
  TChange extends MutationChange,
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
