import type {
  MutationSequenceConfig,
  MutationTreeSnapshot
} from './constants'
import {
  MUTATION_NODE,
  MUTATION_OPTIONAL,
} from './constants'
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
}) as MutationDictionaryNode<TKey, TValue>

export const createSequenceNode = <TItem,>(
  config?: MutationSequenceConfig<TItem>
): MutationSequenceNode<TItem> => createNode({
  kind: 'sequence',
  keyOf: config?.keyOf ?? ((item: TItem) => item as string)
}) as MutationSequenceNode<TItem>

export const createTreeNode = <TNodeId extends string, TValue,>(): MutationTreeNode<TNodeId, TValue> => createNode({
  kind: 'tree',
  valueShape: {} as MutationTreeSnapshot<TValue>
}) as MutationTreeNode<TNodeId, TValue>

export const createSingletonNode = <TShape extends MutationShape>(
  shape: TShape
): MutationSingletonNode<TShape> => createNode({
  kind: 'singleton',
  shape
})

export const createTableNode = <TId extends string, TShape extends MutationShape>(
  shape: TShape
): MutationTableNode<TId, TShape> => createNode({
  kind: 'table',
  shape
}) as MutationTableNode<TId, TShape>

export const createMapNode = <TId extends string, TShape extends MutationShape>(
  shape: TShape
): MutationMapNode<TId, TShape> => createNode({
  kind: 'map',
  shape
}) as MutationMapNode<TId, TShape>
