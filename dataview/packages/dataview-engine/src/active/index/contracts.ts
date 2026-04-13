import type {
  CommitDelta,
  DataDoc,
  Field,
  FieldId,
  RecordId,
  DataRecord,
  ViewGroup
} from '@dataview/core/contracts'
import type {
  Bucket
} from '@dataview/core/field'
import type {
  IndexTrace
} from '#engine/contracts/public'

export type SortedIdSet<T extends string> = readonly T[]
export type BucketKey = string
export type SortKey = unknown

export interface RecordIndex {
  ids: readonly RecordId[]
  fieldIds: readonly FieldId[]
  order: ReadonlyMap<RecordId, number>
  rows: ReadonlyMap<RecordId, DataRecord>
  values: ReadonlyMap<FieldId, ReadonlyMap<RecordId, unknown>>
  rev: number
}

export interface SearchDemand {
  all?: boolean
  fields?: readonly FieldId[]
}

export interface GroupDemand {
  fieldId: FieldId
  mode?: ViewGroup['mode']
  bucketSort?: ViewGroup['bucketSort']
  bucketInterval?: ViewGroup['bucketInterval']
}

export interface IndexDemand {
  search?: SearchDemand
  groups?: readonly GroupDemand[]
  sortFields?: readonly FieldId[]
  calculationFields?: readonly FieldId[]
}

export interface NormalizedIndexDemand {
  recordFields: readonly FieldId[]
  search: {
    all: boolean
    fields: readonly FieldId[]
  }
  groups: readonly GroupDemand[]
  sortFields: readonly FieldId[]
  calculationFields: readonly FieldId[]
}

export interface SearchIndex {
  all?: SearchTextIndex
  fields: ReadonlyMap<FieldId, SearchTextIndex>
  rev: number
}

export interface SearchTextIndex {
  texts: ReadonlyMap<RecordId, string>
}

export interface RecordBucketLookup {
  get(recordId: RecordId): readonly BucketKey[] | undefined
}

export interface GroupFieldIndex {
  fieldId: FieldId
  mode?: ViewGroup['mode']
  bucketSort?: ViewGroup['bucketSort']
  bucketInterval?: ViewGroup['bucketInterval']
  recordBuckets: RecordBucketLookup
  bucketRecords: ReadonlyMap<BucketKey, SortedIdSet<RecordId>>
  buckets: ReadonlyMap<BucketKey, Bucket>
  order: readonly BucketKey[]
}

export interface GroupIndex {
  groups: ReadonlyMap<string, GroupFieldIndex>
  rev: number
}

export interface SortFieldIndex {
  asc: readonly RecordId[]
  desc: readonly RecordId[]
}

export interface SortIndex {
  fields: ReadonlyMap<FieldId, SortFieldIndex>
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
}

export interface SectionAggregateState extends AggregateState {
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
  entries: ReadonlyMap<RecordId, AggregateEntry>
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

export interface FieldSyncContext {
  schemaFields: ReadonlySet<FieldId>
  valueFields: ReadonlySet<FieldId>
  touchedRecords: ReadonlySet<RecordId> | 'all'
  recordSetChanged: boolean
}

export interface IndexDeriveResult {
  state: IndexState
  demand: NormalizedIndexDemand
  trace?: IndexTrace
}

export interface IndexDeriveInput {
  previous: IndexState
  previousDemand: NormalizedIndexDemand
  document: DataDoc
  delta: CommitDelta
  demand?: IndexDemand
}
