import type {
  DataDoc,
  Field,
  FieldId,
  RecordId,
  ViewGroup
} from '@dataview/core/contracts'
import type {
  Bucket
} from '@dataview/core/field'
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
  all?: boolean
  fields?: readonly FieldId[]
}

export type GroupCapability = 'filter' | 'section'

export interface GroupDemand {
  fieldId: FieldId
  capability: GroupCapability
  mode?: ViewGroup['mode']
  bucketSort?: ViewGroup['bucketSort']
  bucketInterval?: ViewGroup['bucketInterval']
}

export interface IndexDemand {
  search?: SearchDemand
  groups?: readonly GroupDemand[]
  displayFields?: readonly FieldId[]
  sortFields?: readonly FieldId[]
  calculations?: readonly CalculationDemand[]
}

export interface NormalizedIndexDemand {
  recordFields: readonly FieldId[]
  search: {
    all: boolean
    fields: readonly FieldId[]
  }
  groups: readonly GroupDemand[]
  sortFields: readonly FieldId[]
  calculations: readonly CalculationDemand[]
}

export interface SearchIndex {
  all?: SearchTextIndex
  fields: ReadonlyMap<FieldId, SearchTextIndex>
  rev: number
}

export interface SearchTextIndex {
  texts: ReadonlyMap<RecordId, string>
  bigrams: ReadonlyMap<string, SortedIdSet<RecordId>>
  trigrams: ReadonlyMap<string, SortedIdSet<RecordId>>
}

export interface FilterBucketIndex {
  capability: 'filter'
  fieldId: FieldId
  recordBuckets: ReadonlyMap<RecordId, readonly BucketKey[]>
  bucketRecords: ReadonlyMap<BucketKey, SortedIdSet<RecordId>>
}

export interface SectionGroupIndex {
  capability: 'section'
  fieldId: FieldId
  mode?: ViewGroup['mode']
  bucketSort?: ViewGroup['bucketSort']
  bucketInterval?: ViewGroup['bucketInterval']
  recordSections: ReadonlyMap<RecordId, readonly BucketKey[]>
  sectionRecords: ReadonlyMap<BucketKey, SortedIdSet<RecordId>>
  buckets: ReadonlyMap<BucketKey, Bucket>
  order: readonly BucketKey[]
}

export type GroupFieldIndex =
  | FilterBucketIndex
  | SectionGroupIndex

export interface GroupIndex {
  groups: ReadonlyMap<string, GroupFieldIndex>
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
  valueFields: ReadonlySet<FieldId> | 'all'
  touchedRecords: ReadonlySet<RecordId> | 'all'
  recordSetChanged: boolean
}

export interface IndexReadContext {
  document: DataDoc
  reader: import('@dataview/engine/document/reader').DocumentReader
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
