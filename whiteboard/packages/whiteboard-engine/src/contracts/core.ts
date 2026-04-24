import type { IdChangeSet } from '@shared/core'

export type Revision = number

export type IdDelta<TKey> = IdChangeSet<TKey>
