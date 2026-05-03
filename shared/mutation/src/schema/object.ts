import type {
  MutationObjectNode,
  MutationShape
} from './node'
import {
  createObjectNode
} from './create'

export const object = <const TShape extends MutationShape>(
  shape: TShape
): MutationObjectNode<TShape> => createObjectNode(shape)
