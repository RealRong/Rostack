import type {
  MutationSequenceNode
} from './node'
import {
  createSequenceNode
} from './create'

export const sequence = <TItem,>(): MutationSequenceNode<TItem> => createSequenceNode<TItem>()
