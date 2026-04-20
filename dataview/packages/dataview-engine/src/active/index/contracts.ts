import type {
  DataDoc,
  Field,
  FieldId,
  RecordId,
  ViewGroup
} from '@dataview/core/contracts'
import type { DocumentReader } from '@dataview/engine/document/reader'
import type {
  IndexTrace
} from '@dataview/engine/contracts/public'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'
import type {
  CalculationDemand,
  CalculationEntry,
  FieldReducerState,
  ReducerCapabilitySet
} from '@dataview/engine/active/shared/calculation'

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
}

export interface FieldContext {
  all: readonly Field[]
  byId: ReadonlyMap<FieldId, Field>
}

export interface FieldSyncContext {
  schemaFields: ReadonlySet<FieldId>
  valueFields: ReadonlySet<FieldId> | 'all'
  touchedRecords: ReadonlySet<RecordId> | 'all'
  recordSetChanged: boolean
}

export interface IndexReadContext {
  document: DataDoc
  reader: DocumentReader
  fieldIds: readonly FieldId[]
  fieldIdSet: ReadonlySet<FieldId>
}

export interface IndexDeriveContext extends IndexReadContext, FieldSyncContext {
  changed: boolean
  touchedFields: ReadonlySet<FieldId> | 'all'
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
  impact: ActiveImpact
  demand?: IndexDemand
}
