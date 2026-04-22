import type { EntityTable } from '@shared/core'
import { ViewOptions } from '@dataview/core/contracts/viewOptions'

export type { EntityTable } from '@shared/core'

export type RecordId = string
export type ViewId = string
export type CustomFieldId = string
export type ViewFilterRuleId = string
export type ViewSortRuleId = string
export const TITLE_FIELD_ID = 'title'
export type TitleFieldId = typeof TITLE_FIELD_ID
export type FieldId = CustomFieldId | TitleFieldId
export type FilterPresetId = string
export type NodeId = string
export type ViewType = 'table' | 'gallery' | 'list' | 'kanban' | 'calendar' | (string & {})
export type SortDirection = 'asc' | 'desc'
export type BucketSort = 'manual' | 'labelAsc' | 'labelDesc' | 'valueAsc' | 'valueDesc'
export type FilterOperator = 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'custom'
export type ResolvedGroupKey = string | number | boolean | null | undefined
export type IndexPath = number[]
export type CalculationMetric =
  | 'countAll'
  | 'countValues'
  | 'countUniqueValues'
  | 'countEmpty'
  | 'countNonEmpty'
  | 'percentEmpty'
  | 'percentNonEmpty'
  | 'sum'
  | 'average'
  | 'median'
  | 'min'
  | 'max'
  | 'range'
  | 'countByOption'
  | 'percentByOption'
export type StatusCategory = 'todo' | 'in_progress' | 'complete'
export type NumberFormat = 'number' | 'integer' | 'percent' | 'currency'
export type DateDisplayFormat = 'full' | 'short' | 'mdy' | 'dmy' | 'ymd' | 'relative'
export type TimeDisplayFormat = '12h' | '24h'
export type DateValueKind = 'date' | 'datetime'
export type AssetAccept = 'any' | 'image' | 'video' | 'audio' | 'media'
export type FieldKind = 'title' | CustomFieldKind
export type CustomFieldKind =
  | 'text'
  | 'number'
  | 'select'
  | 'multiSelect'
  | 'status'
  | 'date'
  | 'boolean'
  | 'url'
  | 'email'
  | 'phone'
  | 'asset'

export interface FlatOption {
  id: string
  name: string
  color: string | null
}

export interface StatusOption extends FlatOption {
  category: StatusCategory
}

export type FieldOption =
  | FlatOption
  | StatusOption

export type DateValue =
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

export interface FileValue {
  id: string
  name: string
  url?: string
  mimeType?: string
  size?: number
  meta?: Record<string, unknown>
}

export type ViewCalc = Partial<Record<FieldId, CalculationMetric>>

export interface DataRecord {
  id: RecordId
  title: string
  type?: string
  values: Partial<Record<CustomFieldId, unknown>>
  meta?: Record<string, unknown>
}

export interface TitleField {
  id: TitleFieldId
  name: string
  kind: 'title'
  system: true
  meta?: Record<string, unknown>
}

export interface TextField {
  id: CustomFieldId
  name: string
  kind: 'text'
  meta?: Record<string, unknown>
}

export interface UrlField {
  id: CustomFieldId
  name: string
  kind: 'url'
  displayFullUrl: boolean
  meta?: Record<string, unknown>
}

export interface EmailField {
  id: CustomFieldId
  name: string
  kind: 'email'
  meta?: Record<string, unknown>
}

export interface PhoneField {
  id: CustomFieldId
  name: string
  kind: 'phone'
  meta?: Record<string, unknown>
}

export interface NumberField {
  id: CustomFieldId
  name: string
  kind: 'number'
  format: NumberFormat
  precision: number | null
  currency: string | null
  useThousandsSeparator: boolean
  meta?: Record<string, unknown>
}

export interface SelectField {
  id: CustomFieldId
  name: string
  kind: 'select'
  options: FlatOption[]
  meta?: Record<string, unknown>
}

export interface MultiSelectField {
  id: CustomFieldId
  name: string
  kind: 'multiSelect'
  options: FlatOption[]
  meta?: Record<string, unknown>
}

export interface StatusField {
  id: CustomFieldId
  name: string
  kind: 'status'
  options: StatusOption[]
  defaultOptionId: string | null
  meta?: Record<string, unknown>
}

export interface DateField {
  id: CustomFieldId
  name: string
  kind: 'date'
  displayDateFormat: DateDisplayFormat
  displayTimeFormat: TimeDisplayFormat
  defaultValueKind: DateValueKind
  defaultTimezone: string | null
  meta?: Record<string, unknown>
}

export interface BooleanField {
  id: CustomFieldId
  name: string
  kind: 'boolean'
  meta?: Record<string, unknown>
}

export interface AssetField {
  id: CustomFieldId
  name: string
  kind: 'asset'
  multiple: boolean
  accept: AssetAccept
  meta?: Record<string, unknown>
}

export type CustomField =
  | TextField
  | UrlField
  | EmailField
  | PhoneField
  | NumberField
  | SelectField
  | MultiSelectField
  | StatusField
  | DateField
  | BooleanField
  | AssetField

export type Field =
  | TitleField
  | CustomField

export interface FilterRule {
  id: ViewFilterRuleId
  fieldId: FieldId
  presetId: FilterPresetId
  value?: FilterValue
}

export interface Filter {
  mode: 'and' | 'or'
  rules: EntityTable<ViewFilterRuleId, FilterRule>
}

export interface FilterOptionSetValue {
  kind: 'option-set'
  optionIds: string[]
}

export type FilterValue =
  | string
  | number
  | boolean
  | DateValue
  | FilterOptionSetValue

export interface Search {
  query: string
  fields?: FieldId[]
}

export interface SortRule {
  id: ViewSortRuleId
  fieldId: FieldId
  direction: SortDirection
}

export interface Sort {
  rules: EntityTable<ViewSortRuleId, SortRule>
}

export interface BucketState {
  hidden?: boolean
  collapsed?: boolean
}

export interface ViewGroup {
  field: FieldId
  mode: string
  bucketSort: BucketSort
  bucketInterval?: number
  showEmpty?: boolean
  buckets?: Readonly<Record<string, BucketState>>
}

export interface ViewDisplay {
  fields: readonly FieldId[]
}

export interface View {
  id: ViewId
  type: ViewType
  name: string
  search: Search
  filter: Filter
  sort: Sort
  group?: ViewGroup
  calc: ViewCalc
  display: ViewDisplay
  options: ViewOptions
  orders: RecordId[]
}

export interface DataDoc {
  schemaVersion: number
  records: EntityTable<RecordId, DataRecord>
  fields: EntityTable<CustomFieldId, CustomField>
  views: EntityTable<ViewId, View>
  activeViewId?: ViewId
  meta?: Record<string, unknown>
}
