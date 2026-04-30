import type {
  MutationChangeInput,
  MutationDelta,
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

export type MutationEntityProgramStep<
  Tag extends string = string
> =
  | {
      type: 'entity.create'
      entity: MutationEntityRef
      value: unknown
      tags?: readonly Tag[]
    }
  | {
      type: 'entity.patch'
      entity: MutationEntityRef
      writes: Readonly<Record<string, unknown>>
      tags?: readonly Tag[]
    }
  | {
      type: 'entity.patchMany'
      table: string
      updates: readonly {
        id: string
        writes: Readonly<Record<string, unknown>>
      }[]
      tags?: readonly Tag[]
    }
  | {
      type: 'entity.delete'
      entity: MutationEntityRef
      tags?: readonly Tag[]
    }

export type MutationOrderedProgramStep<
  Tag extends string = string
> =
  | {
      type: 'ordered.insert'
      structure: string
      itemId: string
      value: unknown
      to: MutationOrderedAnchor
      tags?: readonly Tag[]
    }
  | {
      type: 'ordered.move'
      structure: string
      itemId: string
      to: MutationOrderedAnchor
      tags?: readonly Tag[]
    }
  | {
      type: 'ordered.splice'
      structure: string
      itemIds: readonly string[]
      to: MutationOrderedAnchor
      tags?: readonly Tag[]
    }
  | {
      type: 'ordered.delete'
      structure: string
      itemId: string
      tags?: readonly Tag[]
    }
  | {
      type: 'ordered.patch'
      structure: string
      itemId: string
      patch: unknown
      tags?: readonly Tag[]
    }

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
      tags?: readonly Tag[]
    }
  | {
      type: 'tree.move'
      structure: string
      nodeId: string
      parentId?: string
      index?: number
      tags?: readonly Tag[]
    }
  | {
      type: 'tree.delete'
      structure: string
      nodeId: string
      tags?: readonly Tag[]
    }
  | {
      type: 'tree.restore'
      structure: string
      snapshot: MutationTreeSubtreeSnapshot
      tags?: readonly Tag[]
    }
  | {
      type: 'tree.node.patch'
      structure: string
      nodeId: string
      patch: unknown
      tags?: readonly Tag[]
    }

export type MutationSemanticProgramStep<
  Tag extends string = string
> =
  | {
      type: 'semantic.tag'
      value: Tag
    }
  | {
      type: 'semantic.change'
      key: string
      change?: MutationChangeInput
    }
  | {
      type: 'semantic.footprint'
      footprint: readonly MutationFootprint[]
    }

export type MutationProgramStep<
  Tag extends string = string
> =
  | MutationEntityProgramStep<Tag>
  | MutationOrderedProgramStep<Tag>
  | MutationTreeProgramStep<Tag>
  | MutationSemanticProgramStep<Tag>

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
    case 'semantic.tag':
    case 'semantic.change':
    case 'semantic.footprint':
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
