import type {
  CompiledMutationSchema
} from '../compile/schema'
import type {
  MutationSequenceConfig,
  MutationTreeSnapshot
} from './constants'
import {
  MUTATION_COMPILED_SCHEMA,
  MUTATION_NODE,
  MUTATION_OPTIONAL,
  MUTATION_SCHEMA,
  MUTATION_TYPE,
} from './constants'

type MutationNodeBase<TKind extends string> = {
  readonly [MUTATION_NODE]: true
  readonly kind: TKind
}

type MutationTypeBrand<TType> = {
  readonly [MUTATION_TYPE]?: TType
}

export type MutationFieldNode<TValue, TOptional extends boolean = false> = MutationNodeBase<'field'> & MutationTypeBrand<{
  value: TValue
}> & {
  readonly [MUTATION_OPTIONAL]: TOptional
}

export type MutationObjectNode<TShape extends MutationShape> = MutationNodeBase<'object'> & {
  readonly shape: TShape
}

export type MutationDictionaryNode<TKey extends string, TValue> = MutationNodeBase<'dictionary'> & MutationTypeBrand<{
  key: TKey
  value: TValue
}>

export type MutationSequenceNode<TItem> = MutationNodeBase<'sequence'> & MutationTypeBrand<{
  item: TItem
}> & {
  readonly keyOf: MutationSequenceConfig<TItem>['keyOf']
}

export type MutationTreeNode<TNodeId extends string, TValue> = MutationNodeBase<'tree'> & MutationTypeBrand<{
  nodeId: TNodeId
  value: TValue
}> & {
  readonly valueShape: MutationTreeSnapshot<TValue>
}

export type MutationSingletonNode<TShape extends MutationShape> = MutationNodeBase<'singleton'> & {
  readonly shape: TShape
}

export type MutationTableNode<TId extends string, TShape extends MutationShape> = MutationNodeBase<'table'> & MutationTypeBrand<{
  id: TId
}> & {
  readonly shape: TShape
}

export type MutationMapNode<TId extends string, TShape extends MutationShape> = MutationNodeBase<'map'> & MutationTypeBrand<{
  id: TId
}> & {
  readonly shape: TShape
}

export type MutationShapeNode =
  | MutationFieldNode<unknown, boolean>
  | MutationObjectNode<MutationShape>
  | MutationDictionaryNode<string, unknown>
  | MutationSequenceNode<unknown>
  | MutationTreeNode<string, unknown>
  | MutationSingletonNode<MutationShape>
  | MutationTableNode<string, MutationShape>
  | MutationMapNode<string, MutationShape>

export interface MutationShape {
  readonly [key: string]: MutationShapeNode | MutationShape
}

export type MutationOptionalNode = {
  readonly [MUTATION_OPTIONAL]: true
}

export type MutationOptionalizedNode<TNode extends MutationShapeNode> =
  TNode extends MutationFieldNode<infer TValue, boolean>
    ? MutationFieldNode<TValue, true>
    : TNode & MutationOptionalNode

export type MutationSchema<TShape extends MutationShape = MutationShape> = {
  readonly [MUTATION_SCHEMA]: true
  readonly shape: TShape
  readonly [MUTATION_COMPILED_SCHEMA]: CompiledMutationSchema<TShape>
}

export type MutationShapeOfSchema<TSchema extends MutationSchema> =
  TSchema extends MutationSchema<infer TShape>
    ? TShape
    : never

export const isMutationNode = (value: unknown): value is MutationShapeNode => Boolean(
  value
  && typeof value === 'object'
  && (value as Record<PropertyKey, unknown>)[MUTATION_NODE] === true
)

export const isMutationSchema = <TShape extends MutationShape = MutationShape>(
  value: unknown
): value is MutationSchema<TShape> => Boolean(
  value
  && typeof value === 'object'
  && (value as Record<PropertyKey, unknown>)[MUTATION_SCHEMA] === true
)

export const isMutationGroup = (value: unknown): value is MutationShape => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && !isMutationNode(value)
)
