import type {
  Field,
  FieldId,
  RecordId,
  Row
} from '@dataview/core/contracts'

export type SortedIdSet<T extends string> = readonly T[]
export type BucketKey = string
export type SortKey = unknown

export interface RecordIndex {
  ids: readonly RecordId[]
  rows: ReadonlyMap<RecordId, Row>
  values: ReadonlyMap<FieldId, ReadonlyMap<RecordId, unknown>>
  rev: number
}

export interface RecordTokens {
  all: readonly string[]
  fields: ReadonlyMap<FieldId, readonly string[]>
}

export interface SearchIndex {
  all: ReadonlyMap<string, SortedIdSet<RecordId>>
  fields: ReadonlyMap<FieldId, ReadonlyMap<string, SortedIdSet<RecordId>>>
  records: ReadonlyMap<RecordId, RecordTokens>
  rev: number
}

export interface GroupFieldIndex {
  recordBuckets: ReadonlyMap<RecordId, readonly BucketKey[]>
  bucketRecords: ReadonlyMap<BucketKey, SortedIdSet<RecordId>>
}

export interface GroupIndex {
  fields: ReadonlyMap<FieldId, GroupFieldIndex>
  rev: number
}

export interface SortIndex {
  fields: ReadonlyMap<FieldId, ReadonlyMap<RecordId, SortKey>>
  rev: number
}

export interface AggregateState {
  count: number
  nonEmpty: number
  sum?: number
  min?: number | string | null
  max?: number | string | null
  distribution: ReadonlyMap<string, number>
  entries: ReadonlyMap<RecordId, AggregateEntry>
}

export interface AggregateEntry {
  empty: boolean
  label?: string
  number?: number
  comparable?: number | string
}

export interface FieldCalcIndex {
  global: AggregateState
  buckets?: ReadonlyMap<BucketKey, AggregateState>
  recordBuckets?: ReadonlyMap<RecordId, readonly BucketKey[]>
}

export interface CalculationIndex {
  fields: ReadonlyMap<FieldId, FieldCalcIndex>
  rev: number
}

export interface IndexState {
  records: RecordIndex
  search: SearchIndex
  group: GroupIndex
  sort: SortIndex
  calculations: CalculationIndex
}

export interface FieldContext {
  all: readonly Field[]
  byId: ReadonlyMap<FieldId, Field>
}
