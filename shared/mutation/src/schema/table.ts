import type {
  MutationShape,
  MutationTableNode
} from './node'
import {
  createTableNode
} from './create'

export const table = <TId extends string, const TShape extends MutationShape>(
  shape: TShape
): MutationTableNode<TId, TShape> => createTableNode<TId, TShape>(shape)
