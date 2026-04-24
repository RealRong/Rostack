import type { IdDelta as SharedIdDelta } from '@shared/projector/delta'

export type Revision = number

export type IdDelta<TKey> = SharedIdDelta<TKey>
