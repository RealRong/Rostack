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
  all?: readonly string[]
  fields: ReadonlyMap<FieldId, readonly string[]>
}

export interface SearchDemand {
  all?: boolean
  fields?: readonly FieldId[]
}

export interface IndexDemand {
  search?: SearchDemand
  groupFields?: readonly FieldId[]
  sortFields?: readonly FieldId[]
  calculationFields?: readonly FieldId[]
}

export interface SearchIndex {
  all?: ReadonlyMap<string, ReadonlySet<RecordId>>
  fields: ReadonlyMap<FieldId, ReadonlyMap<string, ReadonlySet<RecordId>>>
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
  uniqueCounts: ReadonlyMap<string, number>
  numberCounts: ReadonlyMap<number, number>
  optionCounts: ReadonlyMap<string, number>
  entries: ReadonlyMap<RecordId, AggregateEntry>
}

export interface AggregateEntry {
  empty: boolean
  label?: string
  number?: number
  comparable?: number | string
  uniqueKey?: string
  optionId?: string
}

export interface FieldCalcIndex {
  global: AggregateState
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
