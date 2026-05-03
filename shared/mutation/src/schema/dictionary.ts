import type {
  MutationDictionaryNode
} from './node'
import {
  createDictionaryNode
} from './create'

export const dictionary = <TKey extends string, TValue,>(): MutationDictionaryNode<TKey, TValue> => createDictionaryNode<TKey, TValue>()
