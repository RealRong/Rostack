export type MutationOrigin =
  | 'user'
  | 'remote'
  | 'system'
  | 'history'

export type Origin = MutationOrigin

export interface ApplyCommit<
  Doc,
  Op,
  Key,
  Extra = void
> {
  kind: 'apply'
  rev: number
  at: number
  origin: MutationOrigin
  doc: Doc
  forward: readonly Op[]
  inverse: readonly Op[]
  footprint: readonly Key[]
  extra: Extra
}

export interface ReplaceCommit<Doc> {
  kind: 'replace'
  rev: number
  at: number
  origin: MutationOrigin
  doc: Doc
}

export type CommitRecord<
  Doc,
  Op,
  Key,
  Extra = void
> =
  | ApplyCommit<Doc, Op, Key, Extra>
  | ReplaceCommit<Doc>

export interface CommitStream<C> {
  subscribe(listener: (commit: C) => void): () => void
}
