export type Origin =
  | 'user'
  | 'remote'
  | 'system'
  | 'load'
  | 'history'

export interface Write<
  Doc,
  Op,
  Key,
  Extra = void
> {
  rev: number
  at: number
  origin: Origin
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
  origin: Origin
  doc: Doc
}

export interface ApplyCommit<
  Doc,
  Op,
  Key,
  Extra = void
> extends Write<Doc, Op, Key, Extra> {
  kind: 'apply'
}

export type CommitRecord<
  Doc,
  Op,
  Key,
  Extra = void
> =
  | ApplyCommit<Doc, Op, Key, Extra>
  | ReplaceCommit<Doc>

export interface WriteStream<W> {
  subscribe(listener: (write: W) => void): () => void
}

export interface CommitStream<C> {
  subscribe(listener: (commit: C) => void): () => void
}
