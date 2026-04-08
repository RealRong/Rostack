import type {
  CalculationMetric,
  FieldId,
  CustomFieldKind,
  CustomFieldId,
  CustomField,
  FilterPresetId,
  Row,
  StatusCategory,
  Filter,
  Search,
  Sorter,
  View,
  ViewCalc,
  ViewDisplay,
  ViewGroup,
  ViewType,
  RecordId,
  ViewId
} from './state'
import type { GalleryCardSize } from './gallery'
import type { KanbanNewRecordPosition } from './kanban'
import type { RowInsertTarget } from './operations'
import type { TableOptions, ViewOptions } from './viewOptions'

export type EditTarget =
  | {
      type: 'record'
      recordId: RecordId
    }
  | {
      type: 'records'
      recordIds: RecordId[]
    }

export type ValueApplyAction =
  | {
      type: 'set'
      field: CustomFieldId
      value: unknown
    }
  | {
      type: 'patch'
      patch: Record<string, unknown>
    }
  | {
      type: 'clear'
      field: CustomFieldId
    }

export interface RowCreateInput {
  id?: RecordId
  title?: string
  type?: string
  values?: Partial<Record<CustomFieldId, unknown>>
  meta?: Record<string, unknown>
}

export interface CustomFieldCreateInput {
  id?: CustomFieldId
  name: string
  kind?: CustomFieldKind
  meta?: Record<string, unknown>
}

export interface ViewCreateInput {
  id?: ViewId
  name: string
  type: ViewType
  search?: Search
  filter?: Filter
  sort?: Sorter[]
  group?: ViewGroup
  calc?: ViewCalc
  display?: ViewDisplay
  options?: ViewOptions
  orders?: RecordId[]
}

export type Command =
  | {
      type: 'value.apply'
      target: EditTarget
      action: ValueApplyAction
    }
  | {
      type: 'record.create'
      input: RowCreateInput
    }
  | {
      type: 'customField.create'
      input: CustomFieldCreateInput
    }
  | {
      type: 'view.create'
      input: ViewCreateInput
    }
  | {
      type: 'view.duplicate'
      viewId: ViewId
      name?: string
    }
  | {
      type: 'view.put'
      view: View
    }
  | {
      type: 'view.rename'
      viewId: ViewId
      name: string
    }
  | {
      type: 'view.type.set'
      viewId: ViewId
      value: ViewType
    }
  | {
      type: 'view.search.set'
      viewId: ViewId
      value: string
    }
  | {
      type: 'view.filter.add'
      viewId: ViewId
      fieldId: FieldId
    }
  | {
      type: 'view.filter.set'
      viewId: ViewId
      index: number
      rule: Filter['rules'][number]
    }
  | {
      type: 'view.filter.preset'
      viewId: ViewId
      index: number
      presetId: FilterPresetId
    }
  | {
      type: 'view.filter.value'
      viewId: ViewId
      index: number
      value?: Filter['rules'][number]['value']
    }
  | {
      type: 'view.filter.mode'
      viewId: ViewId
      value: Filter['mode']
    }
  | {
      type: 'view.filter.remove'
      viewId: ViewId
      index: number
    }
  | {
      type: 'view.filter.clear'
      viewId: ViewId
    }
  | {
      type: 'view.sort.add'
      viewId: ViewId
      fieldId: FieldId
      direction?: Sorter['direction']
    }
  | {
      type: 'view.sort.set'
      viewId: ViewId
      fieldId: FieldId
      direction: Sorter['direction']
    }
  | {
      type: 'view.sort.only'
      viewId: ViewId
      fieldId: FieldId
      direction: Sorter['direction']
    }
  | {
      type: 'view.sort.replace'
      viewId: ViewId
      index: number
      sorter: Sorter
    }
  | {
      type: 'view.sort.remove'
      viewId: ViewId
      index: number
    }
  | {
      type: 'view.sort.move'
      viewId: ViewId
      from: number
      to: number
    }
  | {
      type: 'view.sort.clear'
      viewId: ViewId
    }
  | {
      type: 'view.group.set'
      viewId: ViewId
      fieldId: FieldId
    }
  | {
      type: 'view.group.clear'
      viewId: ViewId
    }
  | {
      type: 'view.group.toggle'
      viewId: ViewId
      fieldId: FieldId
    }
  | {
      type: 'view.group.mode.set'
      viewId: ViewId
      value: string
    }
  | {
      type: 'view.group.sort.set'
      viewId: ViewId
      value: ViewGroup['bucketSort']
    }
  | {
      type: 'view.group.interval.set'
      viewId: ViewId
      value?: ViewGroup['bucketInterval']
    }
  | {
      type: 'view.group.empty.set'
      viewId: ViewId
      value: boolean
    }
  | {
      type: 'view.group.bucket.show'
      viewId: ViewId
      key: string
    }
  | {
      type: 'view.group.bucket.hide'
      viewId: ViewId
      key: string
    }
  | {
      type: 'view.group.bucket.collapse'
      viewId: ViewId
      key: string
    }
  | {
      type: 'view.group.bucket.expand'
      viewId: ViewId
      key: string
    }
  | {
      type: 'view.group.bucket.toggleCollapse'
      viewId: ViewId
      key: string
    }
  | {
      type: 'view.calc.set'
      viewId: ViewId
      fieldId: FieldId
      metric: CalculationMetric | null
    }
  | {
      type: 'view.display.replace'
      viewId: ViewId
      fieldIds: FieldId[]
    }
  | {
      type: 'view.display.move'
      viewId: ViewId
      fieldIds: FieldId[]
      beforeFieldId?: FieldId | null
    }
  | {
      type: 'view.display.show'
      viewId: ViewId
      fieldId: FieldId
      beforeFieldId?: FieldId | null
    }
  | {
      type: 'view.display.hide'
      viewId: ViewId
      fieldId: FieldId
    }
  | {
      type: 'view.display.clear'
      viewId: ViewId
    }
  | {
      type: 'view.table.setWidths'
      viewId: ViewId
      widths: TableOptions['widths']
    }
  | {
      type: 'view.table.verticalLines.set'
      viewId: ViewId
      value: boolean
    }
  | {
      type: 'view.gallery.labels.set'
      viewId: ViewId
      value: boolean
    }
  | {
      type: 'view.gallery.setCardSize'
      viewId: ViewId
      value: GalleryCardSize
    }
  | {
      type: 'view.kanban.setNewRecordPosition'
      viewId: ViewId
      value: KanbanNewRecordPosition
    }
  | {
      type: 'view.kanban.fillColor.set'
      viewId: ViewId
      value: boolean
    }
  | {
      type: 'view.order.move'
      viewId: ViewId
      recordIds: RecordId[]
      beforeRecordId?: RecordId
    }
  | {
      type: 'view.order.clear'
      viewId: ViewId
    }
  | {
      type: 'view.order.set'
      viewId: ViewId
      orders: RecordId[]
    }
  | {
      type: 'view.remove'
      viewId: ViewId
    }
  | {
      type: 'customField.put'
      field: CustomField
    }
  | {
      type: 'customField.convert'
      fieldId: CustomFieldId
      input: {
        kind: CustomFieldKind
      }
    }
  | {
      type: 'customField.replaceSchema'
      fieldId: CustomFieldId
      schema: CustomField
    }
  | {
      type: 'customField.duplicate'
      fieldId: CustomFieldId
    }
  | {
      type: 'customField.patch'
      fieldId: CustomFieldId
      patch: Partial<Omit<CustomField, 'id'>>
    }
  | {
      type: 'customField.option.remove'
      fieldId: CustomFieldId
      optionId: string
    }
  | {
      type: 'customField.option.create'
      fieldId: CustomFieldId
      input?: {
        name?: string
      }
    }
  | {
      type: 'customField.option.reorder'
      fieldId: CustomFieldId
      optionIds: string[]
    }
  | {
      type: 'customField.option.update'
      fieldId: CustomFieldId
      optionId: string
      patch: {
        name?: string
        color?: string
        category?: StatusCategory
      }
    }
  | {
      type: 'customField.remove'
      fieldId: CustomFieldId
    }
  | {
      type: 'external.bumpVersion'
      source: string
    }
  | {
      type: 'record.insertAt'
      records: Row[]
      target?: RowInsertTarget
    }
  | {
      type: 'record.apply'
      target: EditTarget
      patch: Partial<Omit<Row, 'id'>>
    }
  | {
      type: 'record.remove'
      recordIds: RecordId[]
    }

export type CommandType = Command['type']

export type CommandPayload<TType extends CommandType> = Omit<Extract<Command, { type: TType }>, 'type'>
