import type {
  BucketSort,
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  DataRecord,
  FieldId,
  Filter,
  FilterPresetId,
  FilterRule,
  FilterValue,
  GalleryView,
  KanbanCardsPerColumn,
  KanbanView,
  RecordId,
  Search,
  Sort,
  SortDirection,
  SortRule,
  StatusCategory,
  TableView,
  ViewCalc,
  ViewGroup,
  ViewGroupBucketId,
  ViewFilterRuleId,
  ViewId,
  ViewSortRuleId,
  ViewOptionsByType,
  ViewType,
  TableOptions
} from './state'

export interface RecordCreateInput {
  id?: RecordId
  title?: string
  type?: string
  values?: Partial<Record<CustomFieldId, unknown>>
  meta?: Record<string, unknown>
}

export interface FieldCreateInput {
  id?: CustomFieldId
  name: string
  kind?: CustomFieldKind
  meta?: Record<string, unknown>
}

export interface RecordFieldWriteManyInput {
  recordIds: RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}

export interface FieldOptionPatch {
  name?: string
  color?: string
  category?: StatusCategory
}

interface ViewCreateInputBase {
  id?: ViewId
  name: string
  search?: Search
  filter?: Filter
  sort?: Sort
  calc?: ViewCalc
  fields?: FieldId[]
}

export interface TableViewCreateInput extends ViewCreateInputBase {
  type: TableView['type']
  group?: ViewGroup
  options?: TableOptions
}

export interface GalleryViewCreateInput extends ViewCreateInputBase {
  type: GalleryView['type']
  group?: ViewGroup
  options?: ViewOptionsByType['gallery']
}

export interface KanbanViewCreateInput extends ViewCreateInputBase {
  type: KanbanView['type']
  group?: ViewGroup
  options?: ViewOptionsByType['kanban']
}

export type ViewCreateInput =
  | TableViewCreateInput
  | GalleryViewCreateInput
  | KanbanViewCreateInput

export interface ViewFilterCreateInput {
  id?: ViewFilterRuleId
  fieldId: FieldId
  presetId?: FilterPresetId
  value?: FilterValue
}

export interface ViewSortCreateInput {
  id?: ViewSortRuleId
  fieldId: FieldId
  direction?: SortDirection
}

export type Intent =
  | {
      type: 'record.create'
      input: RecordCreateInput
    }
  | {
      type: 'record.remove'
      recordIds: RecordId[]
    }
  | {
      type: 'record.fields.writeMany'
      recordIds: RecordId[]
      set?: Partial<Record<FieldId, unknown>>
      clear?: readonly FieldId[]
    }
  | {
      type: 'field.create'
      input: FieldCreateInput
    }
  | {
      type: 'field.patch'
      id: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'field.replace'
      id: CustomFieldId
      field: CustomField
    }
  | {
      type: 'field.setKind'
      id: CustomFieldId
      kind: CustomFieldKind
    }
  | {
      type: 'field.duplicate'
      id: CustomFieldId
    }
  | {
      type: 'field.option.create'
      field: CustomFieldId
      name?: string
    }
  | {
      type: 'field.option.move'
      field: CustomFieldId
      option: string
      before?: string
      category?: StatusCategory
    }
  | {
      type: 'field.option.patch'
      field: CustomFieldId
      option: string
      patch: FieldOptionPatch
    }
  | {
      type: 'field.option.remove'
      field: CustomFieldId
      option: string
    }
  | {
      type: 'field.remove'
      id: CustomFieldId
    }
  | {
      type: 'view.create'
      input: ViewCreateInput
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
      input: ViewFilterCreateInput
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
      input: ViewSortCreateInput
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
      value: GalleryView['options']['card']['size']
    }
  | {
      type: 'view.gallery.layout.set'
      id: ViewId
      value: GalleryView['options']['card']['layout']
    }
  | {
      type: 'view.kanban.wrap.set'
      id: ViewId
      value: KanbanView['options']['card']['wrap']
    }
  | {
      type: 'view.kanban.size.set'
      id: ViewId
      value: KanbanView['options']['card']['size']
    }
  | {
      type: 'view.kanban.layout.set'
      id: ViewId
      value: KanbanView['options']['card']['layout']
    }
  | {
      type: 'view.kanban.fillColor.set'
      id: ViewId
      value: KanbanView['options']['fillColumnColor']
    }
  | {
      type: 'view.kanban.cardsPerColumn.set'
      id: ViewId
      value: KanbanCardsPerColumn
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
      records: RecordId[]
      before?: RecordId
    }
  | {
      type: 'view.fields.move'
      id: ViewId
      field: FieldId
      before?: FieldId
    }
  | {
      type: 'view.fields.splice'
      id: ViewId
      fields: FieldId[]
      before?: FieldId
    }
  | {
      type: 'view.fields.show'
      id: ViewId
      field: FieldId
      before?: FieldId
    }
  | {
      type: 'view.fields.hide'
      id: ViewId
      field: FieldId
    }
  | {
      type: 'view.fields.clear'
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

export type IntentType = Intent['type']
