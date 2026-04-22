export type Revision = number

export interface IdDelta<TKey> {
  added: ReadonlySet<TKey>
  updated: ReadonlySet<TKey>
  removed: ReadonlySet<TKey>
}
