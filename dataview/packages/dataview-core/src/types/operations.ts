import type {
  BucketSort,
  CustomField,
  CustomFieldId,
  DataRecord,
  FieldId,
  FieldOption,
  Filter,
  FilterRule,
  FilterValue,
  RecordId,
  Search,
  SortDirection,
  SortRule,
  StatusCategory,
  ViewCalc,
  ViewGroup,
  ViewGroupBucketId,
  ViewFilterRuleId,
  View,
  ViewId,
  ViewSortRuleId,
  ViewType
} from './state'

export interface RecordFieldWriteManyOperationInput {
  recordIds: readonly RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}

export interface DocumentRecordFieldRestoreEntry {
  recordId: RecordId
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}

export type DocumentOperation =
  | {
      type: 'document.patch'
      patch: Partial<{
        schemaVersion: number
        activeViewId: ViewId | undefined
        meta: Record<string, unknown>
      }>
    }
  | {
      type: 'record.create'
      value: DataRecord
    }
  | {
      type: 'record.patch'
      id: RecordId
      patch: Partial<Omit<DataRecord, 'id' | 'values'>>
    }
  | {
      type: 'record.delete'
      id: RecordId
    }
  | {
      type: 'record.remove'
      recordIds: RecordId[]
    }
  | {
      type: 'record.values.writeMany'
      recordIds: readonly RecordId[]
      set?: Partial<Record<FieldId, unknown>>
      clear?: readonly FieldId[]
    }
  | {
      type: 'record.values.restoreMany'
      entries: readonly DocumentRecordFieldRestoreEntry[]
    }
  | {
      type: 'view.create'
      value: View
    }
  | {
      type: 'view.rename'
      id: ViewId
      name: string
    }
  | {
      type: 'view.type.set'
      id: ViewId
      viewType: ViewType
    }
  | {
      type: 'view.search.set'
      id: ViewId
      search: Search
    }
  | {
      type: 'view.filter.create'
      id: ViewId
      rule: FilterRule
      before?: ViewFilterRuleId
    }
  | {
      type: 'view.filter.patch'
      id: ViewId
      rule: ViewFilterRuleId
      patch: Partial<Pick<FilterRule, 'fieldId' | 'presetId' | 'value'>>
    }
  | {
      type: 'view.filter.move'
      id: ViewId
      rule: ViewFilterRuleId
      before?: ViewFilterRuleId
    }
  | {
      type: 'view.filter.mode.set'
      id: ViewId
      mode: Filter['mode']
    }
  | {
      type: 'view.filter.remove'
      id: ViewId
      rule: ViewFilterRuleId
    }
  | {
      type: 'view.filter.clear'
      id: ViewId
    }
  | {
      type: 'view.sort.create'
      id: ViewId
      rule: SortRule
      before?: ViewSortRuleId
    }
  | {
      type: 'view.sort.patch'
      id: ViewId
      rule: ViewSortRuleId
      patch: Partial<Pick<SortRule, 'fieldId' | 'direction'>>
    }
  | {
      type: 'view.sort.move'
      id: ViewId
      rule: ViewSortRuleId
      before?: ViewSortRuleId
    }
  | {
      type: 'view.sort.remove'
      id: ViewId
      rule: ViewSortRuleId
    }
  | {
      type: 'view.sort.clear'
      id: ViewId
    }
  | {
      type: 'view.group.set'
      id: ViewId
      group: ViewGroup
    }
  | {
      type: 'view.group.clear'
      id: ViewId
    }
  | {
      type: 'view.group.toggle'
      id: ViewId
      field: FieldId
    }
  | {
      type: 'view.group.mode.set'
      id: ViewId
      mode: string
    }
  | {
      type: 'view.group.sort.set'
      id: ViewId
      sort: BucketSort
    }
  | {
      type: 'view.group.interval.set'
      id: ViewId
      interval?: ViewGroup['bucketInterval']
    }
  | {
      type: 'view.group.showEmpty.set'
      id: ViewId
      value: boolean
    }
  | {
      type: 'view.section.show'
      id: ViewId
      bucket: ViewGroupBucketId
    }
  | {
      type: 'view.section.hide'
      id: ViewId
      bucket: ViewGroupBucketId
    }
  | {
      type: 'view.section.collapse'
      id: ViewId
      bucket: ViewGroupBucketId
    }
  | {
      type: 'view.section.expand'
      id: ViewId
      bucket: ViewGroupBucketId
    }
  | {
      type: 'view.calc.set'
      id: ViewId
      field: FieldId
      metric: ViewCalc[FieldId] | null
    }
  | {
      type: 'view.table.widths.set'
      id: ViewId
      widths: Partial<Record<FieldId, number>>
    }
  | {
      type: 'view.table.verticalLines.set'
      id: ViewId
      value: boolean
    }
  | {
      type: 'view.table.wrap.set'
      id: ViewId
      value: boolean
    }
  | {
      type: 'view.gallery.wrap.set'
      id: ViewId
      value: boolean
    }
  | {
      type: 'view.gallery.size.set'
      id: ViewId
      value: View['type'] extends 'gallery'
        ? never
        : never
    }
  | {
      type: 'view.gallery.layout.set'
      id: ViewId
      value: View['type'] extends 'gallery'
        ? never
        : never
    }
  | {
      type: 'view.kanban.wrap.set'
      id: ViewId
      value: boolean
    }
  | {
      type: 'view.kanban.size.set'
      id: ViewId
      value: 'sm' | 'md' | 'lg'
    }
  | {
      type: 'view.kanban.layout.set'
      id: ViewId
      value: 'compact' | 'stacked'
    }
  | {
      type: 'view.kanban.fillColor.set'
      id: ViewId
      value: boolean
    }
  | {
      type: 'view.kanban.cardsPerColumn.set'
      id: ViewId
      value: 25 | 50 | 100 | 'all'
    }
  | {
      type: 'view.order.move'
      id: ViewId
      record: RecordId
      before?: RecordId
    }
  | {
      type: 'view.order.splice'
      id: ViewId
      records: readonly RecordId[]
      before?: RecordId
    }
  | {
      type: 'view.display.move'
      id: ViewId
      field: FieldId
      before?: FieldId
    }
  | {
      type: 'view.display.splice'
      id: ViewId
      fields: readonly FieldId[]
      before?: FieldId
    }
  | {
      type: 'view.display.show'
      id: ViewId
      field: FieldId
      before?: FieldId
    }
  | {
      type: 'view.display.hide'
      id: ViewId
      field: FieldId
    }
  | {
      type: 'view.display.clear'
      id: ViewId
    }
  | {
      type: 'view.delete'
      id: ViewId
    }
  | {
      type: 'view.open'
      id: ViewId
    }
  | {
      type: 'view.remove'
      id: ViewId
    }
  | {
      type: 'field.create'
      value: CustomField
    }
  | {
      type: 'field.patch'
      id: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'field.option.insert'
      field: CustomFieldId
      option: FieldOption
      before?: string
    }
  | {
      type: 'field.option.move'
      field: CustomFieldId
      option: string
      before?: string
      category?: StatusCategory
    }
  | {
      type: 'field.option.delete'
      field: CustomFieldId
      option: string
    }
  | {
      type: 'field.delete'
      id: CustomFieldId
    }
  | {
      type: 'field.remove'
      id: CustomFieldId
    }
  | {
      type: 'external.version.bump'
      source: string
    }

export type OperationType = DocumentOperation['type']

export type OperationPayload<TType extends OperationType> = Omit<
  Extract<DocumentOperation, { type: TType }>,
  'type'
>
