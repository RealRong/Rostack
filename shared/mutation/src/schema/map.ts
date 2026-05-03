import type {
  MutationMapNode,
  MutationShape
} from './node'
import {
  createMapNode
} from './create'

export const map = <TId extends string, const TShape extends MutationShape>(
  shape: TShape
): MutationMapNode<TId, TShape> => createMapNode<TId, TShape>(shape)
