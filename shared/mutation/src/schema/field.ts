import type {
  MutationFieldNode
} from './node'
import {
  createFieldNode
} from './create'

export const field = <TValue,>(): MutationFieldNode<TValue> => createFieldNode<TValue>()
