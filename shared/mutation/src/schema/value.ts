import type {
  MutationOptionalNode,
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
  TNode extends MutationFieldNode<infer TValue, infer TOptional extends boolean>
    ? (TOptional extends true ? TValue | undefined : TValue)
  : TNode extends MutationObjectNode<infer TShape> ? MutationValueOfShape<TShape>
  : TNode extends MutationDictionaryNode<infer TKey extends string, infer TValue>
    ? Partial<Record<TKey, TValue>>
  : TNode extends MutationSequenceNode<infer TItem>
    ? TItem[]
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

type MutationRequiredKeys<TShape extends MutationShape> = keyof {
  readonly [K in keyof TShape as TShape[K] extends MutationOptionalNode
    ? never
    : K]: true
}

type MutationOptionalKeys<TShape extends MutationShape> = keyof {
  readonly [K in keyof TShape as TShape[K] extends MutationOptionalNode
    ? K
    : never]: true
}

export type MutationValueOfShape<TShape extends MutationShape> = {
  [K in MutationRequiredKeys<TShape>]: MutationValueOfNode<TShape[K]>
} & {
  [K in MutationOptionalKeys<TShape>]?: MutationValueOfNode<TShape[K]>
}

export type MutationTableValue<TId extends string, TShape extends MutationShape> = {
  ids: TId[]
  byId: Partial<Record<TId, MutationValueOfShape<TShape>>>
}

export type MutationMapValue<TId extends string, TShape extends MutationShape> = Partial<
  Record<TId, MutationValueOfShape<TShape>>
>

export type MutationDocument<TSchema extends MutationSchema> =
  TSchema extends MutationSchema<infer TShape>
    ? MutationValueOfShape<TShape>
    : never
