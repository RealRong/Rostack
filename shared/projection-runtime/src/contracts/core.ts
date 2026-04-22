export type Revision = number

export type Action = 'reuse' | 'sync' | 'rebuild'

export interface Flags {
  changed: boolean
}

export interface Ids<TKey> {
  all: ReadonlySet<TKey>
}

export interface Family<TKey, TValue> {
  ids: readonly TKey[]
  byId: ReadonlyMap<TKey, TValue>
}
