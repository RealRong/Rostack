import type {
  CompiledMutationDictionaryNode,
  CompiledMutationMapNode,
  CompiledMutationNode,
  CompiledMutationObjectNode,
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
  MutationTreeInsertInput,
  MutationTreeMoveInput
} from '../schema/constants'
import type {
  MutationMapValue,
  MutationTableValue,
  MutationValueOfShape
} from '../schema/value'
import type {
  MutationEntityTarget,
  MutationScope,
  MutationWrite
} from './writes'

type MutationWriterObject<TShape extends MutationShape> = {
  readonly [K in Extract<keyof TShape, string>]: MutationWriterNode<TShape[K]>
}

type MutationEntityWriter<TShape extends MutationShape> = MutationWriterObject<TShape> & {
  replace(value: MutationValueOfShape<TShape>): void
}

type MutationFieldWriter<TValue> = {
  set(value: TValue): void
}

type MutationDictionaryWriter<TKey extends string, TValue> = {
  set(key: TKey, value: TValue): void
  delete(key: TKey): void
  replace(value: Partial<Record<TKey, TValue>>): void
}

type MutationSequenceWriter<TItem> = {
  insert(value: TItem, anchor?: import('../schema/constants').MutationSequenceAnchor): void
  move(value: TItem, anchor?: import('../schema/constants').MutationSequenceAnchor): void
  remove(value: TItem): void
  replace(value: readonly TItem[]): void
}

type MutationTreeWriter<TNodeId extends string, TValue> = {
  insert(nodeId: TNodeId, value: MutationTreeInsertInput<TValue>): void
  move(nodeId: TNodeId, value: MutationTreeMoveInput): void
  remove(nodeId: TNodeId): void
  patch(nodeId: TNodeId, value: Record<string, unknown>): void
  replace(value: import('../schema/constants').MutationTreeSnapshot<TValue>): void
}

type MutationSingletonWriter<TShape extends MutationShape> = MutationEntityWriter<TShape>

type MutationTableWriter<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationEntityWriter<TShape>) & {
  create(
    id: TId,
    value: MutationValueOfShape<TShape>,
    anchor?: import('../schema/constants').MutationSequenceAnchor
  ): void
  replace(id: TId, value: MutationValueOfShape<TShape>): void
  remove(id: TId): void
  move(id: TId, anchor?: import('../schema/constants').MutationSequenceAnchor): void
}

type MutationMapWriter<TId extends string, TShape extends MutationShape> = ((id: TId) => MutationEntityWriter<TShape>) & {
  create(id: TId, value: MutationValueOfShape<TShape>): void
  replace(id: TId, value: MutationValueOfShape<TShape>): void
  remove(id: TId): void
}

export type MutationWriterNode<TNode> =
  TNode extends MutationFieldNode<infer TValue, infer TOptional extends boolean>
    ? MutationFieldWriter<TOptional extends true ? TValue | undefined : TValue>
  : TNode extends MutationObjectNode<infer TShape>
    ? MutationWriterObject<TShape>
  : TNode extends MutationDictionaryNode<infer TKey extends string, infer TValue>
    ? MutationDictionaryWriter<TKey, TValue>
  : TNode extends MutationSequenceNode<infer TItem>
    ? MutationSequenceWriter<TItem>
  : TNode extends MutationTreeNode<infer TNodeId extends string, infer TValue>
    ? MutationTreeWriter<TNodeId, TValue>
  : TNode extends MutationSingletonNode<infer TShape>
    ? MutationSingletonWriter<TShape>
  : TNode extends MutationTableNode<infer TId extends string, infer TShape>
    ? MutationTableWriter<TId, TShape>
  : TNode extends MutationMapNode<infer TId extends string, infer TShape>
    ? MutationMapWriter<TId, TShape>
  : TNode extends MutationShape
    ? MutationWriterObject<TNode>
  : never

export type MutationWriter<TSchema extends MutationSchema = MutationSchema> =
  TSchema extends MutationSchema<infer TShape>
    ? MutationWriterObject<TShape>
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

const nextScope = (target?: MutationEntityTarget): MutationScope =>
  target
    ? [...target.scope, target.id]
    : []

const createFieldWriter = (
  nodeId: number,
  writes: MutationWrite[],
  target?: MutationEntityTarget
): MutationFieldWriter<unknown> => ({
  set(value) {
    writes.push({
      kind: 'field.set',
      nodeId,
      target,
      value
    })
  }
})

const createDictionaryWriter = (
  nodeId: number,
  writes: MutationWrite[],
  target?: MutationEntityTarget
): MutationDictionaryWriter<string, unknown> => ({
  set(key, value) {
    writes.push({
      kind: 'dictionary.set',
      nodeId,
      target,
      key,
      value
    })
  },
  delete(key) {
    writes.push({
      kind: 'dictionary.delete',
      nodeId,
      target,
      key
    })
  },
  replace(value) {
    writes.push({
      kind: 'dictionary.replace',
      nodeId,
      target,
      value
    })
  }
})

const createSequenceWriter = (
  node: CompiledMutationSequenceNode,
  writes: MutationWrite[],
  target?: MutationEntityTarget
): MutationSequenceWriter<unknown> => ({
  insert(value, anchor) {
    writes.push({
      kind: 'sequence.insert',
      nodeId: node.nodeId,
      target,
      value,
      anchor
    })
  },
  move(value, anchor) {
    writes.push({
      kind: 'sequence.move',
      nodeId: node.nodeId,
      target,
      value,
      anchor
    })
  },
  remove(value) {
    writes.push({
      kind: 'sequence.remove',
      nodeId: node.nodeId,
      target,
      value
    })
  },
  replace(value) {
    writes.push({
      kind: 'sequence.replace',
      nodeId: node.nodeId,
      target,
      value
    })
  }
})

const createTreeWriter = (
  node: CompiledMutationTreeNode,
  writes: MutationWrite[],
  target?: MutationEntityTarget
): MutationTreeWriter<string, unknown> => ({
  insert(treeNodeId, value) {
    writes.push({
      kind: 'tree.insert',
      nodeId: node.nodeId,
      target,
      treeNodeId,
      value
    })
  },
  move(treeNodeId, value) {
    writes.push({
      kind: 'tree.move',
      nodeId: node.nodeId,
      target,
      treeNodeId,
      value
    })
  },
  remove(treeNodeId) {
    writes.push({
      kind: 'tree.remove',
      nodeId: node.nodeId,
      target,
      treeNodeId
    })
  },
  patch(treeNodeId, value) {
    writes.push({
      kind: 'tree.patch',
      nodeId: node.nodeId,
      target,
      treeNodeId,
      value
    })
  },
  replace(value) {
    writes.push({
      kind: 'tree.replace',
      nodeId: node.nodeId,
      target,
      value
    })
  }
})

const createObjectWriter = (
  node: CompiledMutationObjectNode,
  writes: MutationWrite[],
  target?: MutationEntityTarget
): object => {
  const result: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(node.entries)) {
    defineLazyProperty(result, key, () => createWriterNode(entry, writes, target))
  }

  return result
}

const createEntityWriter = (
  nodeId: number,
  entity: CompiledMutationObjectNode,
  writes: MutationWrite[],
  target?: MutationEntityTarget
): object => Object.assign(
  createObjectWriter(entity, writes, target),
  {
    replace(value: MutationValueOfShape<MutationShape>) {
      writes.push({
        kind: 'entity.replace',
        nodeId,
        target,
        value
      })
    }
  }
)

const createSingletonWriter = (
  node: CompiledMutationSingletonNode,
  writes: MutationWrite[],
  target?: MutationEntityTarget
): MutationSingletonWriter<MutationShape> => createEntityWriter(
  node.nodeId,
  node.entity,
  writes,
  target
) as MutationSingletonWriter<MutationShape>

const createTableWriter = (
  node: CompiledMutationTableNode,
  writes: MutationWrite[],
  target?: MutationEntityTarget
): MutationTableWriter<string, MutationShape> => {
  const entityCache = new Map<string, object>()
  const ownerScope = nextScope(target)

  const createEntity = (id: string) => {
    const cached = entityCache.get(id)
    if (cached) {
      return cached
    }

    const next = createEntityWriter(
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
      create(id: string, value: MutationValueOfShape<MutationShape>, anchor?: import('../schema/constants').MutationSequenceAnchor) {
        writes.push({
          kind: 'entity.create',
          nodeId: node.nodeId,
          target: {
            scope: ownerScope,
            id
          },
          value,
          anchor
        })
      },
      replace(id: string, value: MutationValueOfShape<MutationShape>) {
        writes.push({
          kind: 'entity.replace',
          nodeId: node.nodeId,
          target: {
            scope: ownerScope,
            id
          },
          value
        })
      },
      remove(id: string) {
        writes.push({
          kind: 'entity.remove',
          nodeId: node.nodeId,
          target: {
            scope: ownerScope,
            id
          }
        })
      },
      move(id: string, anchor?: import('../schema/constants').MutationSequenceAnchor) {
        writes.push({
          kind: 'entity.move',
          nodeId: node.nodeId,
          target: {
            scope: ownerScope,
            id
          },
          anchor
        })
      }
    }
  ) as MutationTableWriter<string, MutationShape>
}

const createMapWriter = (
  node: CompiledMutationMapNode,
  writes: MutationWrite[],
  target?: MutationEntityTarget
): MutationMapWriter<string, MutationShape> => {
  const entityCache = new Map<string, object>()
  const ownerScope = nextScope(target)

  const createEntity = (id: string) => {
    const cached = entityCache.get(id)
    if (cached) {
      return cached
    }

    const next = createEntityWriter(
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
      create(id: string, value: MutationValueOfShape<MutationShape>) {
        writes.push({
          kind: 'entity.create',
          nodeId: node.nodeId,
          target: {
            scope: ownerScope,
            id
          },
          value
        })
      },
      replace(id: string, value: MutationValueOfShape<MutationShape>) {
        writes.push({
          kind: 'entity.replace',
          nodeId: node.nodeId,
          target: {
            scope: ownerScope,
            id
          },
          value
        })
      },
      remove(id: string) {
        writes.push({
          kind: 'entity.remove',
          nodeId: node.nodeId,
          target: {
            scope: ownerScope,
            id
          }
        })
      }
    }
  ) as MutationMapWriter<string, MutationShape>
}

const createWriterNode = (
  node: CompiledMutationNode,
  writes: MutationWrite[],
  target?: MutationEntityTarget
): unknown => {
  switch (node.kind) {
    case 'field':
      return createFieldWriter(node.nodeId, writes, target)
    case 'dictionary':
      return createDictionaryWriter(node.nodeId, writes, target)
    case 'sequence':
      return createSequenceWriter(node, writes, target)
    case 'tree':
      return createTreeWriter(node, writes, target)
    case 'object':
      return createObjectWriter(node, writes, target)
    case 'singleton':
      return createSingletonWriter(node, writes, target)
    case 'table':
      return createTableWriter(node, writes, target)
    case 'map':
      return createMapWriter(node, writes, target)
  }
}

export const createMutationWriter = <TSchema extends MutationSchema>(
  schema: TSchema,
  writes: MutationWrite[] = []
): MutationWriter<TSchema> => createObjectWriter(
  getCompiledMutationSchema(schema).root,
  writes
) as MutationWriter<TSchema>

export const writer = createMutationWriter
