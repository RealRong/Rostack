export type Revision = number

export type Action = 'reuse' | 'sync' | 'rebuild'

export interface Family<TKey, TValue> {
  ids: readonly TKey[]
  byId: ReadonlyMap<TKey, TValue>
}

export interface Ids<TKey> {
  all: ReadonlySet<TKey>
}

export interface Flags {
  changed: boolean
}
