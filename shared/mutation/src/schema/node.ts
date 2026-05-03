import {
  MUTATION_NODE,
  MUTATION_OPTIONAL,
  MUTATION_SCHEMA,
} from './constants'
import type {
  MutationDeltaBaseOfShape
} from '../delta/facadeTypes'
import type {
  MutationAccessOverride,
  MutationSequenceConfig,
  MutationTreeSnapshot,
} from './constants'
import type {
  MutationMapValue,
  MutationTableValue,
  MutationValueOfShape
} from './value'

type MutationNodeBase<TKind extends string> = {
  readonly [MUTATION_NODE]: true
  readonly kind: TKind
}

export type MutationFieldNode<TValue, TOptional extends boolean = false> = MutationNodeBase<'field'> & {
  readonly [MUTATION_OPTIONAL]: TOptional
  optional(): MutationFieldNode<TValue, true>
}

export type MutationObjectNode<TShape extends MutationShape> = MutationNodeBase<'object'> & {
  readonly shape: TShape
}

export type MutationDictionaryNode<TKey extends string, TValue> = MutationNodeBase<'dictionary'> & {
}

export type MutationSequenceNode<TItem> = MutationNodeBase<'sequence'> & {
  readonly keyOf: MutationSequenceConfig<TItem>['keyOf']
  from(access: MutationAccessOverride<readonly TItem[]>): MutationSequenceNode<TItem>
}

export type MutationTreeNode<TNodeId extends string, TValue> = MutationNodeBase<'tree'> & {
  from(access: MutationAccessOverride<MutationTreeSnapshot<TValue>>): MutationTreeNode<TNodeId, TValue>
}

export type MutationSingletonNode<TShape extends MutationShape> = MutationNodeBase<'singleton'> & {
  readonly shape: TShape
  from(
    access: MutationAccessOverride<MutationValueOfShape<TShape>>
  ): MutationSingletonNode<TShape>
}

export type MutationTableNode<TId extends string, TShape extends MutationShape> = MutationNodeBase<'table'> & {
  readonly shape: TShape
  from(
    access: MutationAccessOverride<MutationTableValue<TId, TShape>>
  ): MutationTableNode<TId, TShape>
}

export type MutationMapNode<TId extends string, TShape extends MutationShape> = MutationNodeBase<'map'> & {
  readonly shape: TShape
  from(
    access: MutationAccessOverride<MutationMapValue<TId, TShape>>
  ): MutationMapNode<TId, TShape>
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

export type MutationSchemaChangeSet = Record<string, unknown>

export type MutationSchemaChangeFactory<
  TShape extends MutationShape,
  TChanges extends MutationSchemaChangeSet
> = (
  change: MutationDeltaBaseOfShape<TShape>
) => TChanges

export type MutationSchema<
  TShape extends MutationShape = MutationShape,
  TChanges extends MutationSchemaChangeSet = {}
> = {
  readonly [MUTATION_SCHEMA]: true
  readonly shape: TShape
  changes<TNextChanges extends MutationSchemaChangeSet>(
    factory: MutationSchemaChangeFactory<TShape, TNextChanges>
  ): MutationSchema<TShape, TNextChanges>
}

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
