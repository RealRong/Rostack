import type {
  MutationSequenceConfig
} from './constants'
import type {
  MutationSequenceNode
} from './node'
import {
  createSequenceNode
} from './create'

export const sequence = <TItem,>(
  config?: MutationSequenceConfig<TItem>
): MutationSequenceNode<TItem> => createSequenceNode<TItem>(config)
