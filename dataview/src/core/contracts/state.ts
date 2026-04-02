export type RecordId = string
export type ViewId = string
export type PropertyId = string
export type GroupNodeId = string
export type GroupViewType = 'table' | 'gallery' | 'list' | 'kanban' | 'calendar' | (string & {})
export type GroupSortDirection = 'asc' | 'desc'
export type GroupBucketSort = 'manual' | 'labelAsc' | 'labelDesc' | 'valueAsc' | 'valueDesc'
export type GroupFilterOperator = 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'custom'
export type GroupResolvedGroupKey = string | number | boolean | null | undefined
export type IndexPath = number[]
export type GroupAggregateOperator = 'count' | 'sum' | 'avg' | 'min' | 'max'
export type GroupAggregateScope = 'all' | 'visible'
export type GroupStatusCategory = 'todo' | 'in_progress' | 'complete'
export type GroupPropertyKind =
  | 'text'
  | 'number'
  | 'select'
  | 'multiSelect'
  | 'status'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'file'
  | 'media'

export interface GroupPropertyOption {
  id: string
  key: string
  name: string
  color?: string
  category?: GroupStatusCategory
}

export type GroupDateValue =
  | {
      kind: 'date'
      start: string
      end?: string
    }
  | {
      kind: 'datetime'
      start: string
      end?: string
      timezone: string | null
    }

export interface GroupFileValue {
  id: string
  name: string
  url?: string
  mimeType?: string
  size?: number
  meta?: Record<string, unknown>
}

export type GroupPropertyConfig =
  | {
      type: 'text'
    }
  | {
      type: 'number'
      format?: 'number' | 'integer' | 'percent' | 'currency'
      precision?: number
      currency?: string
      useThousandsSeparator?: boolean
    }
  | {
      type: 'select'
      options: GroupPropertyOption[]
    }
  | {
      type: 'multiSelect'
      options: GroupPropertyOption[]
    }
  | {
      type: 'status'
      options: GroupPropertyOption[]
    }
  | {
      type: 'date'
      displayDateFormat?: 'full' | 'short' | 'mdy' | 'dmy' | 'ymd' | 'relative'
      displayTimeFormat?: '12h' | '24h'
      defaultValueKind?: 'date' | 'datetime'
      defaultTimezone?: string | null
    }
  | {
      type: 'checkbox'
      label?: string
    }
  | {
      type: 'url'
      displayFullUrl?: boolean
    }
  | {
      type: 'email'
    }
  | {
      type: 'phone'
    }
  | {
      type: 'file'
      multiple?: boolean
      accept?: string[]
    }
  | {
      type: 'media'
      multiple?: boolean
      accept?: Array<'image' | 'video' | 'audio'>
    }

export interface GroupAggregateSpec {
  key: string
  op: GroupAggregateOperator
  property?: PropertyId
  scope?: GroupAggregateScope
}

export interface GroupRecord {
  id: RecordId
  type?: string
  values: Partial<Record<PropertyId, unknown>>
  meta?: Record<string, unknown>
}

export interface GroupProperty {
  id: PropertyId
  name: string
  kind: GroupPropertyKind
  config?: GroupPropertyConfig
  meta?: Record<string, unknown>
}

export interface GroupFilterRule {
  property: PropertyId
  op: GroupFilterOperator
  value?: unknown
}

export interface GroupFilter {
  mode: 'and' | 'or'
  rules: GroupFilterRule[]
}

export interface GroupSearch {
  query: string
  properties?: PropertyId[]
}

export interface GroupSorter {
  property: PropertyId
  direction: GroupSortDirection
}

export interface BucketState {
  hidden?: boolean
  collapsed?: boolean
}

export interface GroupGroupBy {
  property: PropertyId
  mode: string
  bucketSort: GroupBucketSort
  bucketInterval?: number
  showEmpty?: boolean
  buckets?: Readonly<Record<string, BucketState>>
}

export interface GroupViewQuery {
  filter: GroupFilter
  search: GroupSearch
  sorters: GroupSorter[]
  group?: GroupGroupBy
}

export interface GroupView {
  id: ViewId
  type: GroupViewType
  name: string
  query: GroupViewQuery
  aggregates: GroupAggregateSpec[]
  options: import('./viewOptions').GroupViewOptions
  orders: RecordId[]
}

export interface GroupEntityTable<TId extends string, TEntity extends { id: TId }> {
  byId: Record<TId, TEntity>
  order: TId[]
}

export interface GroupDocument {
  schemaVersion: number
  records: GroupEntityTable<RecordId, GroupRecord>
  properties: GroupEntityTable<PropertyId, GroupProperty>
  views: GroupEntityTable<ViewId, GroupView>
  meta?: Record<string, unknown>
}

export type GroupStateSlice =
  | 'documentRecords'
  | 'documentViews'
  | 'documentProperties'
  | 'externalRelations'
