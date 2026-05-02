import type {
  MutationDelta,
  MutationFootprint,
  MutationIssue,
  MutationOrderedAnchor,
  MutationStructuralFact,
  MutationTreeSubtreeSnapshot,
} from '../../write'

export interface MutationEntityTarget {
  kind: 'entity'
  type: string
  id: string
}

export interface MutationOrderedTarget {
  kind: 'ordered'
  type: string
  key?: string
}

export interface MutationTreeTarget {
  kind: 'tree'
  type: string
  key?: string
}

export type MutationTarget =
  | MutationEntityTarget
  | MutationOrderedTarget
  | MutationTreeTarget

export type MutationEntityRef = MutationEntityTarget

type MutationProgramStepMetadata = {}

export type MutationEntityProgramStep =
  | {
      type: 'entity.create'
      entity: MutationEntityRef
      value: unknown
    } & MutationProgramStepMetadata
  | {
      type: 'entity.patch'
      entity: MutationEntityRef
      writes: Readonly<Record<string, unknown>>
    } & MutationProgramStepMetadata
  | {
      type: 'entity.delete'
      entity: MutationEntityRef
    } & MutationProgramStepMetadata

export type MutationOrderedProgramStep =
  | {
      type: 'ordered.insert'
      target: MutationOrderedTarget
      itemId: string
      value: unknown
      to: MutationOrderedAnchor
    } & MutationProgramStepMetadata
  | {
      type: 'ordered.move'
      target: MutationOrderedTarget
      itemId: string
      to: MutationOrderedAnchor
    } & MutationProgramStepMetadata
  | {
      type: 'ordered.splice'
      target: MutationOrderedTarget
      itemIds: readonly string[]
      to: MutationOrderedAnchor
    } & MutationProgramStepMetadata
  | {
      type: 'ordered.delete'
      target: MutationOrderedTarget
      itemId: string
    } & MutationProgramStepMetadata
  | {
      type: 'ordered.patch'
      target: MutationOrderedTarget
      itemId: string
      patch: unknown
    } & MutationProgramStepMetadata

export type MutationTreeProgramStep =
  | {
      type: 'tree.insert'
      target: MutationTreeTarget
      nodeId: string
      parentId?: string
      index?: number
      value?: unknown
    } & MutationProgramStepMetadata
  | {
      type: 'tree.move'
      target: MutationTreeTarget
      nodeId: string
      parentId?: string
      index?: number
    } & MutationProgramStepMetadata
  | {
      type: 'tree.delete'
      target: MutationTreeTarget
      nodeId: string
    } & MutationProgramStepMetadata
  | {
      type: 'tree.restore'
      target: MutationTreeTarget
      snapshot: MutationTreeSubtreeSnapshot
    } & MutationProgramStepMetadata
  | {
      type: 'tree.node.patch'
      target: MutationTreeTarget
      nodeId: string
      patch: unknown
    } & MutationProgramStepMetadata

export type MutationProgramStep =
  | MutationEntityProgramStep
  | MutationOrderedProgramStep
  | MutationTreeProgramStep

export const isMutationProgramStep = (
  value: {
    type: string
  }
): value is MutationProgramStep => {
  switch (value.type) {
    case 'entity.create':
    case 'entity.patch':
    case 'entity.delete':
    case 'ordered.insert':
    case 'ordered.move':
    case 'ordered.splice':
    case 'ordered.delete':
    case 'ordered.patch':
    case 'tree.insert':
    case 'tree.move':
    case 'tree.delete':
    case 'tree.restore':
    case 'tree.node.patch':
      return true
    default:
      return false
  }
}

export interface MutationProgram {
  readonly steps: readonly MutationProgramStep[]
}

export interface AppliedMutationProgram<
  Doc
> {
  document: Doc
  inverse: MutationProgram
  delta: MutationDelta
  structural: readonly MutationStructuralFact[]
  footprint: readonly MutationFootprint[]
  issues: readonly MutationIssue[]
  historyMode: 'track' | 'neutral'
}
