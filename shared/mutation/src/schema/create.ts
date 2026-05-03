import type {
  MutationAccessOverride,
  MutationSequenceConfig,
  MutationTreeSnapshot
} from './constants'
import {
  MUTATION_NODE,
  MUTATION_OPTIONAL,
} from './constants'
import {
  setNodeAccess
} from './internals'
import type {
  MutationDictionaryNode,
  MutationFieldNode,
  MutationMapNode,
  MutationObjectNode,
  MutationSequenceNode,
  MutationShape,
  MutationSingletonNode,
  MutationTableNode,
  MutationTreeNode
} from './node'
import type {
  MutationMapValue,
  MutationTableValue,
  MutationValueOfShape
} from './value'

const createNode = <const TNode extends object>(
  node: TNode
): TNode & {
  readonly [MUTATION_NODE]: true
} => Object.assign(node, {
  [MUTATION_NODE]: true
}) as TNode & {
  readonly [MUTATION_NODE]: true
}

export const createFieldNode = <TValue, TOptional extends boolean = false>(
  optional: TOptional = false as TOptional
): MutationFieldNode<TValue, TOptional> => createNode({
  kind: 'field',
  [MUTATION_OPTIONAL]: optional,
} as {
  kind: 'field'
  [MUTATION_OPTIONAL]: TOptional
}) as MutationFieldNode<TValue, TOptional>

export const createObjectNode = <TShape extends MutationShape>(
  shape: TShape
): MutationObjectNode<TShape> => createNode({
  kind: 'object',
  shape
})

export const createDictionaryNode = <TKey extends string, TValue,>(): MutationDictionaryNode<TKey, TValue> => createNode({
  kind: 'dictionary'
})

export const createSequenceNode = <TItem,>(
  config?: MutationSequenceConfig<TItem>,
  access?: MutationAccessOverride<readonly TItem[]>
): MutationSequenceNode<TItem> => {
  const node = createNode({
    kind: 'sequence',
    keyOf: config?.keyOf ?? ((item: TItem) => item as string),
    from(nextAccess: MutationAccessOverride<readonly TItem[]>) {
      return createSequenceNode(config, nextAccess)
    }
  })

  if (access) {
    setNodeAccess(node, access)
  }

  return node
}

export const createTreeNode = <TNodeId extends string, TValue,>(
  access?: MutationAccessOverride<MutationTreeSnapshot<TValue>>
): MutationTreeNode<TNodeId, TValue> => {
  const node = createNode<{
    kind: 'tree'
    from(nextAccess: MutationAccessOverride<MutationTreeSnapshot<TValue>>): MutationTreeNode<TNodeId, TValue>
  }>({
    kind: 'tree',
    from(nextAccess: MutationAccessOverride<MutationTreeSnapshot<TValue>>) {
      return createTreeNode(nextAccess) as MutationTreeNode<TNodeId, TValue>
    }
  }) as MutationTreeNode<TNodeId, TValue>

  if (access) {
    setNodeAccess(
      node as MutationTreeNode<string, TValue>,
      access as MutationAccessOverride<MutationTreeSnapshot<TValue>>
    )
  }

  return node
}

export const createSingletonNode = <TShape extends MutationShape>(
  shape: TShape,
  access?: MutationAccessOverride<MutationValueOfShape<TShape>>
): MutationSingletonNode<TShape> => {
  const node = createNode({
    kind: 'singleton',
    shape,
    from(nextAccess: MutationAccessOverride<MutationValueOfShape<TShape>>) {
      return createSingletonNode(shape, nextAccess)
    }
  })

  if (access) {
    setNodeAccess(node, access)
  }

  return node
}

export const createTableNode = <TId extends string, TShape extends MutationShape>(
  shape: TShape,
  access?: MutationAccessOverride<MutationTableValue<TId, TShape>>
): MutationTableNode<TId, TShape> => {
  const node = createNode({
    kind: 'table',
    shape,
    from(nextAccess: MutationAccessOverride<MutationTableValue<TId, TShape>>) {
      return createTableNode(shape, nextAccess)
    }
  })

  if (access) {
    setNodeAccess(node, access)
  }

  return node
}

export const createMapNode = <TId extends string, TShape extends MutationShape>(
  shape: TShape,
  access?: MutationAccessOverride<MutationMapValue<TId, TShape>>
): MutationMapNode<TId, TShape> => {
  const node = createNode({
    kind: 'map',
    shape,
    from(nextAccess: MutationAccessOverride<MutationMapValue<TId, TShape>>) {
      return createMapNode(shape, nextAccess)
    }
  })

  if (access) {
    setNodeAccess(node, access)
  }

  return node
}
