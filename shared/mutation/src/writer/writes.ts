import type {
  MutationSequenceAnchor,
  MutationTreeInsertInput,
  MutationTreeMoveInput,
  MutationTreeSnapshot
} from '../schema/constants'

export type MutationScope = readonly string[]

export type MutationEntityTarget = {
  readonly scope: MutationScope
  readonly id: string
}

export type MutationWrite =
  | {
      kind: 'field.set'
      nodeId: number
      target?: MutationEntityTarget
      value: unknown
    }
  | {
      kind: 'dictionary.set'
      nodeId: number
      target?: MutationEntityTarget
      key: string
      value: unknown
    }
  | {
      kind: 'dictionary.delete'
      nodeId: number
      target?: MutationEntityTarget
      key: string
    }
  | {
      kind: 'dictionary.replace'
      nodeId: number
      target?: MutationEntityTarget
      value: Readonly<Record<string, unknown>>
    }
  | {
      kind: 'entity.create'
      nodeId: number
      target: MutationEntityTarget
      value: unknown
      anchor?: MutationSequenceAnchor
    }
  | {
      kind: 'entity.replace'
      nodeId: number
      target?: MutationEntityTarget
      value: unknown
    }
  | {
      kind: 'entity.remove'
      nodeId: number
      target: MutationEntityTarget
    }
  | {
      kind: 'entity.move'
      nodeId: number
      target: MutationEntityTarget
      anchor?: MutationSequenceAnchor
    }
  | {
      kind: 'sequence.insert'
      nodeId: number
      target?: MutationEntityTarget
      value: unknown
      anchor?: MutationSequenceAnchor
    }
  | {
      kind: 'sequence.move'
      nodeId: number
      target?: MutationEntityTarget
      value: unknown
      anchor?: MutationSequenceAnchor
    }
  | {
      kind: 'sequence.remove'
      nodeId: number
      target?: MutationEntityTarget
      value: unknown
    }
  | {
      kind: 'sequence.replace'
      nodeId: number
      target?: MutationEntityTarget
      value: readonly unknown[]
    }
  | {
      kind: 'tree.insert'
      nodeId: number
      target?: MutationEntityTarget
      treeNodeId: string
      value: MutationTreeInsertInput<unknown>
    }
  | {
      kind: 'tree.move'
      nodeId: number
      target?: MutationEntityTarget
      treeNodeId: string
      value: MutationTreeMoveInput
    }
  | {
      kind: 'tree.remove'
      nodeId: number
      target?: MutationEntityTarget
      treeNodeId: string
    }
  | {
      kind: 'tree.patch'
      nodeId: number
      target?: MutationEntityTarget
      treeNodeId: string
      value: Record<string, unknown>
    }
  | {
      kind: 'tree.replace'
      nodeId: number
      target?: MutationEntityTarget
      value: MutationTreeSnapshot<unknown>
    }
