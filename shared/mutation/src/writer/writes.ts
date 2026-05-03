import type {
  MutationSequenceAnchor,
  MutationTreeInsertInput,
  MutationTreeMoveInput,
  MutationTreeSnapshot
} from '../schema/constants'
import type {
  MutationDictionaryNode,
  MutationFieldNode,
  MutationMapNode,
  MutationSequenceNode,
  MutationShape,
  MutationSingletonNode,
  MutationTableNode,
  MutationTreeNode
} from '../schema/node'

export type MutationWrite =
  | {
      kind: 'entity.create'
      node: MutationTableNode<string, MutationShape> | MutationMapNode<string, MutationShape>
      targetId: string
      value: unknown
      anchor?: MutationSequenceAnchor
    }
  | {
      kind: 'entity.replace'
      node: MutationSingletonNode<MutationShape> | MutationTableNode<string, MutationShape> | MutationMapNode<string, MutationShape>
      targetId?: string
      value: unknown
    }
  | {
      kind: 'entity.remove'
      node: MutationTableNode<string, MutationShape> | MutationMapNode<string, MutationShape>
      targetId: string
    }
  | {
      kind: 'entity.move'
      node: MutationTableNode<string, MutationShape>
      targetId: string
      anchor?: MutationSequenceAnchor
    }
  | {
      kind: 'field.set'
      node: MutationFieldNode<unknown>
      targetId?: string
      value: unknown
    }
  | {
      kind: 'dictionary.set'
      node: MutationDictionaryNode<string, unknown>
      targetId?: string
      key: string
      value: unknown
    }
  | {
      kind: 'dictionary.delete'
      node: MutationDictionaryNode<string, unknown>
      targetId?: string
      key: string
    }
  | {
      kind: 'dictionary.replace'
      node: MutationDictionaryNode<string, unknown>
      targetId?: string
      value: Readonly<Record<string, unknown>>
    }
  | {
      kind: 'sequence.insert'
      node: MutationSequenceNode<string>
      targetId?: string
      value: string
      anchor?: MutationSequenceAnchor
    }
  | {
      kind: 'sequence.move'
      node: MutationSequenceNode<string>
      targetId?: string
      value: string
      anchor?: MutationSequenceAnchor
    }
  | {
      kind: 'sequence.remove'
      node: MutationSequenceNode<string>
      targetId?: string
      value: string
    }
  | {
      kind: 'sequence.replace'
      node: MutationSequenceNode<string>
      targetId?: string
      value: readonly string[]
    }
  | {
      kind: 'tree.insert'
      node: MutationTreeNode<string, unknown>
      targetId?: string
      nodeId: string
      value: MutationTreeInsertInput<unknown>
    }
  | {
      kind: 'tree.move'
      node: MutationTreeNode<string, unknown>
      targetId?: string
      nodeId: string
      value: MutationTreeMoveInput
    }
  | {
      kind: 'tree.remove'
      node: MutationTreeNode<string, unknown>
      targetId?: string
      nodeId: string
    }
  | {
      kind: 'tree.patch'
      node: MutationTreeNode<string, unknown>
      targetId?: string
      nodeId: string
      value: Record<string, unknown>
    }
  | {
      kind: 'tree.replace'
      node: MutationTreeNode<string, unknown>
      targetId?: string
      value: MutationTreeSnapshot<unknown>
    }
