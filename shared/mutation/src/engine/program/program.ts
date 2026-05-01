import type {
  MutationDelta,
  MutationDeltaInput,
  MutationFootprint,
  MutationIssue,
  MutationOrderedAnchor,
  MutationStructuralFact,
  MutationTreeSubtreeSnapshot,
} from '../../write'

export interface MutationEntityRef {
  table: string
  id: string
}

type MutationProgramStepMetadata<
  Tag extends string = string
> = {
  tags?: readonly Tag[]
  delta?: MutationDeltaInput
  footprint?: readonly MutationFootprint[]
}

export type MutationEntityProgramStep<
  Tag extends string = string
> =
  | {
      type: 'entity.create'
      entity: MutationEntityRef
      value: unknown
    } & MutationProgramStepMetadata<Tag>
  | {
      type: 'entity.patch'
      entity: MutationEntityRef
      writes: Readonly<Record<string, unknown>>
    } & MutationProgramStepMetadata<Tag>
  | {
      type: 'entity.patchMany'
      table: string
      updates: readonly {
        id: string
        writes: Readonly<Record<string, unknown>>
      }[]
    } & MutationProgramStepMetadata<Tag>
  | {
      type: 'entity.delete'
      entity: MutationEntityRef
    } & MutationProgramStepMetadata<Tag>

export type MutationOrderedProgramStep<
  Tag extends string = string
> =
  | {
      type: 'ordered.insert'
      structure: string
      itemId: string
      value: unknown
      to: MutationOrderedAnchor
    } & MutationProgramStepMetadata<Tag>
  | {
      type: 'ordered.move'
      structure: string
      itemId: string
      to: MutationOrderedAnchor
    } & MutationProgramStepMetadata<Tag>
  | {
      type: 'ordered.splice'
      structure: string
      itemIds: readonly string[]
      to: MutationOrderedAnchor
    } & MutationProgramStepMetadata<Tag>
  | {
      type: 'ordered.delete'
      structure: string
      itemId: string
    } & MutationProgramStepMetadata<Tag>
  | {
      type: 'ordered.patch'
      structure: string
      itemId: string
      patch: unknown
    } & MutationProgramStepMetadata<Tag>

export type MutationTreeProgramStep<
  Tag extends string = string
> =
  | {
      type: 'tree.insert'
      structure: string
      nodeId: string
      parentId?: string
      index?: number
      value?: unknown
    } & MutationProgramStepMetadata<Tag>
  | {
      type: 'tree.move'
      structure: string
      nodeId: string
      parentId?: string
      index?: number
    } & MutationProgramStepMetadata<Tag>
  | {
      type: 'tree.delete'
      structure: string
      nodeId: string
    } & MutationProgramStepMetadata<Tag>
  | {
      type: 'tree.restore'
      structure: string
      snapshot: MutationTreeSubtreeSnapshot
    } & MutationProgramStepMetadata<Tag>
  | {
      type: 'tree.node.patch'
      structure: string
      nodeId: string
      patch: unknown
    } & MutationProgramStepMetadata<Tag>

export type MutationProgramStep<
  Tag extends string = string
> =
  | MutationEntityProgramStep<Tag>
  | MutationOrderedProgramStep<Tag>
  | MutationTreeProgramStep<Tag>

export const isMutationProgramStep = (
  value: {
    type: string
  }
): value is MutationProgramStep => {
  switch (value.type) {
    case 'entity.create':
    case 'entity.patch':
    case 'entity.patchMany':
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

export interface MutationProgram<
  Tag extends string = string
> {
  readonly steps: readonly MutationProgramStep<Tag>[]
}

export interface AppliedMutationProgram<
  Doc,
  Tag extends string = string
> {
  document: Doc
  inverse: MutationProgram<Tag>
  delta: MutationDelta
  structural: readonly MutationStructuralFact[]
  footprint: readonly MutationFootprint[]
  issues: readonly MutationIssue[]
  historyMode: 'track' | 'neutral'
}
