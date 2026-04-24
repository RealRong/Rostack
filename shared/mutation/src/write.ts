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

export interface WriteStream<W> {
  subscribe(listener: (write: W) => void): () => void
}
