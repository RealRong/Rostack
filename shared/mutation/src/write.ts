export type MutationOrigin =
  | 'user'
  | 'remote'
  | 'system'
  | 'history'

export type Origin = MutationOrigin

export type MutationChange =
  | true
  | readonly string[]
  | {
      ids?: readonly string[] | 'all'
      paths?: Record<string, readonly string[] | 'all'>
      order?: true
      [payload: string]: unknown
    }

export type MutationChangeInput = MutationChange

export interface MutationDelta {
  reset?: true
  changes?: Record<string, MutationChange>
}

export type MutationDeltaInput = MutationDelta

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

export type MutationFootprintInput = MutationFootprint

export interface MutationIssue {
  code: string
  message: string
  severity: 'error' | 'warning'
  path?: string
  details?: unknown
}

export interface MutationCommit<
  Doc,
  Op,
  Footprint = MutationFootprint
> {
  kind: 'apply'
  rev: number
  at: number
  origin: MutationOrigin
  document: Doc
  forward: readonly Op[]
  inverse: readonly Op[]
  delta: MutationDelta
  footprint: readonly Footprint[]
  issues: readonly MutationIssue[]
  outputs: readonly unknown[]
}

export interface MutationReplaceCommit<Doc> {
  kind: 'replace'
  rev: number
  at: number
  origin: MutationOrigin
  document: Doc
  delta: {
    reset: true
  }
  issues: readonly MutationIssue[]
  outputs: readonly unknown[]
}

export type MutationReplaceResult<Doc> = MutationReplaceCommit<Doc>

export type MutationCommitRecord<
  Doc,
  Op,
  Footprint = MutationFootprint
> =
  | MutationCommit<Doc, Op, Footprint>
  | MutationReplaceCommit<Doc>

export interface ApplyCommit<
  Doc,
  Op,
  Footprint = MutationFootprint,
  Extra = void
> extends MutationCommit<Doc, Op, Footprint> {
  extra: Extra
}

export type ReplaceCommit<Doc> = MutationReplaceCommit<Doc>

export type CommitRecord<
  Doc,
  Op,
  Footprint = MutationFootprint,
  Extra = void
> =
  | ApplyCommit<Doc, Op, Footprint, Extra>
  | ReplaceCommit<Doc>

export interface CommitStream<C> {
  subscribe(listener: (commit: C) => void): () => void
}
