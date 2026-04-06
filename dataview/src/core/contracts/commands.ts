import type {
  AggregateSpec,
  FieldId,
  CustomFieldKind,
  CustomFieldId,
  CustomField,
  Row,
  StatusCategory,
  View,
  ViewQuery,
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
  query?: ViewQuery
  aggregates?: AggregateSpec[]
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
      type: 'view.query.set'
      viewId: ViewId
      query: ViewQuery
    }
  | {
      type: 'view.aggregates.set'
      viewId: ViewId
      aggregates: AggregateSpec[]
    }
  | {
      type: 'view.display.setFieldIds'
      viewId: ViewId
      fieldIds: FieldId[]
    }
  | {
      type: 'view.table.setWidths'
      viewId: ViewId
      widths: TableOptions['widths']
    }
  | {
      type: 'view.table.setShowVerticalLines'
      viewId: ViewId
      value: boolean
    }
  | {
      type: 'view.gallery.setShowPropertyLabels'
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
      type: 'view.kanban.setFillColumnColor'
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
