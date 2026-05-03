import type {
  MutationSingletonNode,
  MutationShape
} from './node'
import {
  createSingletonNode
} from './create'

export const singleton = <const TShape extends MutationShape>(
  shape: TShape
): MutationSingletonNode<TShape> => createSingletonNode(shape)
