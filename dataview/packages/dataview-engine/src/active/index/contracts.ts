import type {
  CalculationDemand,
  CalculationEntry,
  FieldReducerState,
  ReducerCapabilitySet
} from '@dataview/core/view'
import type {
  DataDoc,
  Field,
  FieldId,
  RecordId,
  ViewGroup
} from '@dataview/core/types'
import type { DataviewQuery } from '@dataview/core/mutation'
import type {
  IndexTrace
} from '@dataview/engine/contracts/performance'
import type {
  MembershipTransition,
  CalculationTransition
} from '@dataview/engine/active/shared/transition'
import type {
  Rows
} from '@dataview/engine/active/shared/rows'

export type SortedIdSet<T extends string> = readonly T[]
export type BucketKey = string

export interface RecordValueIndex {
  byRecord: ReadonlyMap<RecordId, unknown>
  ids: readonly RecordId[]
}

export interface RecordIndex {
  ids: readonly RecordId[]
  fieldIds: readonly FieldId[]
  order: ReadonlyMap<RecordId, number>
  byId: DataDoc['records']['byId']
  values: ReadonlyMap<FieldId, RecordValueIndex>
  rev: number
}

export interface SearchDemand {
  fieldIds: readonly FieldId[]
}

export interface BucketSpec {
  fieldId: FieldId
  mode?: ViewGroup['mode']
  interval?: ViewGroup['bucketInterval']
}

export interface IndexDemand {
  search?: SearchDemand
  buckets?: readonly BucketSpec[]
  displayFields?: readonly FieldId[]
  sortFields?: readonly FieldId[]
  calculations?: readonly CalculationDemand[]
}

export interface NormalizedIndexDemand {
  recordFields: readonly FieldId[]
  search: readonly FieldId[]
  buckets: readonly BucketSpec[]
  sortFields: readonly FieldId[]
  calculations: readonly CalculationDemand[]
}

export interface IndexDemandSetDelta<T> {
  added: readonly T[]
  removed: readonly T[]
}

export interface IndexDemandChangeDelta<T> extends IndexDemandSetDelta<T> {
  changed: readonly T[]
}

export interface IndexDemandDelta {
  recordFields: IndexDemandSetDelta<FieldId>
  search: IndexDemandSetDelta<FieldId>
  buckets: IndexDemandChangeDelta<BucketSpec>
  sort: IndexDemandSetDelta<FieldId>
  calculations: IndexDemandChangeDelta<CalculationDemand>
}

export interface ContentDelta {
  records: ReadonlySet<RecordId> | 'all'
  values: ReadonlySet<FieldId> | 'all'
  schema: ReadonlySet<FieldId>
  touchedFields: ReadonlySet<FieldId> | 'all'
  recordSetChanged: boolean
  reset: boolean
}

export interface SearchIndex {
  fields: ReadonlyMap<FieldId, SearchFieldIndex>
}

export interface SearchFieldIndex {
  fieldId: FieldId
  texts: ReadonlyMap<RecordId, string>
  grams2: ReadonlyMap<string, SortedIdSet<RecordId>>
  grams3: ReadonlyMap<string, SortedIdSet<RecordId>>
  rev: number
}

export interface BucketFieldIndex {
  spec: BucketSpec
  field?: Field
  keysByRecord: ReadonlyMap<RecordId, readonly BucketKey[]>
  recordsByKey: ReadonlyMap<BucketKey, SortedIdSet<RecordId>>
}

export interface BucketIndex {
  fields: ReadonlyMap<string, BucketFieldIndex>
  rev: number
}

export interface SortFieldIndex {
  asc: readonly RecordId[]
}

export interface SortIndex {
  fields: ReadonlyMap<FieldId, SortFieldIndex>
  rev: number
}

export interface FieldCalcIndex {
  fieldId: FieldId
  capabilities: ReducerCapabilitySet
  entries: ReadonlyMap<RecordId, CalculationEntry>
  entriesByIndex: readonly CalculationEntry[]
  global: FieldReducerState
}

export interface CalculationIndex {
  fields: ReadonlyMap<FieldId, FieldCalcIndex>
  rev: number
}

export interface IndexState {
  records: RecordIndex
  search: SearchIndex
  bucket: BucketIndex
  sort: SortIndex
  calculations: CalculationIndex
  rows: Rows
}

export interface IndexDelta {
  bucket?: MembershipTransition<BucketKey, RecordId>
  calculation?: CalculationTransition
  demand?: IndexDemandDelta
  content?: ContentDelta
}

export interface FieldSyncContext {
  schemaFields: ReadonlySet<FieldId>
  valueFields: ReadonlySet<FieldId> | 'all'
  touchedRecords: ReadonlySet<RecordId> | 'all'
  recordSetChanged: boolean
}

export interface IndexReadContext {
  document: DataDoc
  reader: DataviewQuery
  fieldIds: readonly FieldId[]
  fieldIdSet: ReadonlySet<FieldId>
}

export interface IndexDeriveContext extends IndexReadContext, FieldSyncContext {
  changed: boolean
  touchedFields: ReadonlySet<FieldId> | 'all'
}

export interface IndexDeriveResult {
  state: IndexState
  delta?: IndexDelta
  trace?: IndexTrace
}
