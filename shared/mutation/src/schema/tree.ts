import type {
  MutationTreeNode
} from './node'
import {
  createTreeNode
} from './create'

export const tree = <TNodeId extends string, TValue,>(): MutationTreeNode<TNodeId, TValue> => createTreeNode<TNodeId, TValue>()
