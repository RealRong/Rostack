import type {
  MutationSchema,
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
  MutationTreeSnapshot
} from './constants'

export type MutationValueOfNode<TNode> =
  TNode extends MutationFieldNode<infer TValue> ? TValue
  : TNode extends MutationObjectNode<infer TShape> ? MutationValueOfShape<TShape>
  : TNode extends MutationDictionaryNode<infer TKey extends string, infer TValue>
    ? Readonly<Partial<Record<TKey, TValue>>>
  : TNode extends MutationSequenceNode<infer TItem>
    ? readonly TItem[]
  : TNode extends MutationTreeNode<string, infer TValue>
    ? MutationTreeSnapshot<TValue>
  : TNode extends MutationSingletonNode<infer TShape>
    ? MutationValueOfShape<TShape>
  : TNode extends MutationTableNode<infer TId extends string, infer TShape>
    ? MutationTableValue<TId, TShape>
  : TNode extends MutationMapNode<infer TId extends string, infer TShape>
    ? MutationMapValue<TId, TShape>
  : TNode extends MutationShape
    ? MutationValueOfShape<TNode>
  : never

export type MutationValueOfShape<TShape extends MutationShape> = {
  readonly [K in keyof TShape]: MutationValueOfNode<TShape[K]>
}

export type MutationEntityValue<TId extends string, TShape extends MutationShape> = {
  readonly id: TId
} & MutationValueOfShape<TShape>

export type MutationTableValue<TId extends string, TShape extends MutationShape> = {
  readonly ids: readonly TId[]
  readonly byId: Readonly<Partial<Record<TId, MutationEntityValue<TId, TShape>>>>
}

export type MutationMapValue<TId extends string, TShape extends MutationShape> = Readonly<
  Partial<Record<TId, MutationEntityValue<TId, TShape>>>
>

export type MutationDocument<TSchema extends MutationSchema> =
  TSchema extends MutationSchema<infer TShape>
    ? MutationValueOfShape<TShape>
    : never
