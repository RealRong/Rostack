import type { IdDelta as SharedIdDelta } from '@shared/projector'

export type Revision = number

export type IdDelta<TKey> = SharedIdDelta<TKey>
