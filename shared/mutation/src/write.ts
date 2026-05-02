import type {
  MutationProgram
} from './engine/program/program'

export type MutationOrigin =
  | 'user'
  | 'remote'
  | 'system'
  | 'history'

export type Origin = MutationOrigin

export type MutationChangeInput =
  | true
  | readonly string[]
  | {
      ids?: readonly string[] | 'all'
      paths?: Record<string, readonly string[] | 'all'> | 'all'
      order?: true
      [payload: string]: unknown
    }

export interface MutationChange {
  ids?: readonly string[] | 'all'
  paths?: Readonly<Record<string, readonly string[] | 'all'>> | 'all'
  order?: true
  [payload: string]: unknown
}

export interface MutationDelta {
  reset?: true
  changes: Readonly<Record<string, MutationChange>>
  has(key: string): boolean
  changed(key: string, id?: string): boolean
  ids(key: string): ReadonlySet<string> | 'all'
  paths(key: string, id: string): readonly string[] | 'all' | undefined
}

export interface MutationDeltaInput {
  reset?: true
  changes?: Record<string, MutationChangeInput>
}

export type MutationOrderedAnchor =
  | {
      kind: 'start'
    }
  | {
      kind: 'end'
    }
  | {
      kind: 'before'
      itemId: string
    }
  | {
      kind: 'after'
      itemId: string
    }

export interface MutationOrderedSlot {
  prevId?: string
  nextId?: string
}

export interface MutationTreeNodeSnapshot<
  TValue = unknown
> {
  parentId?: string
  children: readonly string[]
  value?: TValue
}

export interface MutationTreeSnapshot<
  TValue = unknown
> {
  rootIds: readonly string[]
  nodes: Readonly<Record<string, MutationTreeNodeSnapshot<TValue>>>
}

export interface MutationTreeSubtreeSnapshot<
  TValue = unknown
> {
  rootId: string
  parentId?: string
  index: number
  nodes: Readonly<Record<string, MutationTreeNodeSnapshot<TValue>>>
}

export type MutationStructuralFact =
  | {
      kind: 'ordered'
      action: 'insert' | 'move' | 'delete' | 'patch'
      structure: string
      itemId: string
      from?: MutationOrderedSlot
      to?: MutationOrderedAnchor
    }
  | {
      kind: 'tree'
      action: 'insert' | 'move' | 'delete' | 'restore' | 'patch'
      structure: string
      nodeId: string
      parentId?: string
      index?: number
      previousParentId?: string
      previousIndex?: number
    }

export type MutationFootprint =
  | {
      kind: 'global'
      family: string
    }
  | {
      kind: 'entity'
      family: string
      id: string
    }
  | {
      kind: 'field'
      family: string
      id: string
      field: string
    }
  | {
      kind: 'record'
      family: string
      id: string
      scope: string
      path: string
    }
  | {
      kind: 'relation'
      family: string
      id: string
      relation: string
      target?: string
    }
  | {
      kind: 'structure'
      structure: string
    }
  | {
      kind: 'structure-item'
      structure: string
      id: string
    }
  | {
      kind: 'structure-parent'
      structure: string
      id: string
    }

export type MutationFootprintInput = MutationFootprint

const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const readNonEmptyString = (
  value: unknown
): string | undefined => (
  typeof value === 'string'
  && value.length > 0
)
  ? value
  : undefined

export const isMutationFootprint = (
  value: unknown
): value is MutationFootprint => {
  if (
    !isObjectRecord(value)
    || typeof value.kind !== 'string'
  ) {
    return false
  }

  switch (value.kind) {
    case 'global':
      return readNonEmptyString(value.family) !== undefined
    case 'entity':
      return (
        readNonEmptyString(value.family) !== undefined
        && readNonEmptyString(value.id) !== undefined
      )
    case 'field':
      return (
        readNonEmptyString(value.family) !== undefined
        && readNonEmptyString(value.id) !== undefined
        && readNonEmptyString(value.field) !== undefined
      )
    case 'record':
      return (
        readNonEmptyString(value.family) !== undefined
        && readNonEmptyString(value.id) !== undefined
        && readNonEmptyString(value.scope) !== undefined
        && typeof value.path === 'string'
      )
    case 'relation':
      return (
        readNonEmptyString(value.family) !== undefined
        && readNonEmptyString(value.id) !== undefined
        && readNonEmptyString(value.relation) !== undefined
        && (value.target === undefined || readNonEmptyString(value.target) !== undefined)
      )
    case 'structure':
      return readNonEmptyString(value.structure) !== undefined
    case 'structure-item':
    case 'structure-parent':
      return (
        readNonEmptyString(value.structure) !== undefined
        && readNonEmptyString(value.id) !== undefined
      )
    default:
      return false
  }
}

export const assertMutationFootprint = (
  value: unknown
): MutationFootprint => {
  if (!isMutationFootprint(value)) {
    throw new Error('Mutation footprint entry is invalid.')
  }

  return value
}

export const assertMutationFootprintList = (
  value: unknown
): readonly MutationFootprint[] => {
  if (!Array.isArray(value)) {
    throw new Error('Mutation footprint must be an array.')
  }

  value.forEach((entry) => {
    assertMutationFootprint(entry)
  })

  return value
}

export interface MutationIssue {
  code: string
  message: string
  severity: 'error' | 'warning'
  path?: string
  details?: unknown
}

export interface MutationCommit<
  Doc,
  Footprint = MutationFootprint,
  Delta extends MutationDelta = MutationDelta
> {
  kind: 'apply'
  rev: number
  at: number
  origin: MutationOrigin
  document: Doc
  authored: MutationProgram
  applied: MutationProgram
  inverse: MutationProgram
  delta: Delta
  structural: readonly MutationStructuralFact[]
  footprint: readonly Footprint[]
  issues: readonly MutationIssue[]
  outputs: readonly unknown[]
}

export interface MutationReplaceCommit<
  Doc,
  Delta extends MutationDelta = MutationDelta
> {
  kind: 'replace'
  rev: number
  at: number
  origin: MutationOrigin
  document: Doc
  delta: Delta
  structural: readonly MutationStructuralFact[]
  issues: readonly MutationIssue[]
  outputs: readonly unknown[]
}

export type MutationReplaceResult<
  Doc,
  Delta extends MutationDelta = MutationDelta
> = MutationReplaceCommit<Doc, Delta>

export type MutationCommitRecord<
  Doc,
  Footprint = MutationFootprint,
  Delta extends MutationDelta = MutationDelta
> =
  | MutationCommit<Doc, Footprint, Delta>
  | MutationReplaceCommit<Doc, Delta>

export interface ApplyCommit<
  Doc,
  Footprint = MutationFootprint,
  Extra = void,
  Delta extends MutationDelta = MutationDelta
> extends MutationCommit<Doc, Footprint, Delta> {
  extra: Extra
}

export type ReplaceCommit<
  Doc,
  Delta extends MutationDelta = MutationDelta
> = MutationReplaceCommit<Doc, Delta>

export type CommitRecord<
  Doc,
  Footprint = MutationFootprint,
  Extra = void,
  Delta extends MutationDelta = MutationDelta
> =
  | ApplyCommit<Doc, Footprint, Extra, Delta>
  | ReplaceCommit<Doc, Delta>

export interface CommitStream<C> {
  subscribe(listener: (commit: C) => void): () => void
}
