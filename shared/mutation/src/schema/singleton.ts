import type {
  MutationShape,
  MutationSingletonNode
} from './node'
import {
  createSingletonNode
} from './create'

export const singleton = <const TShape extends MutationShape>(
  shape: TShape
): MutationSingletonNode<TShape> => createSingletonNode(shape)
