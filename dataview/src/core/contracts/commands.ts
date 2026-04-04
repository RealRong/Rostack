import type {
  GroupAggregateSpec,
  GroupPropertyConfig,
  GroupPropertyKind,
  PropertyId,
  GroupProperty,
  GroupRecord,
  GroupStatusCategory,
  GroupView,
  GroupViewQuery,
  GroupViewType,
  RecordId,
  ViewId
} from './state'
import type { GroupGalleryCardSize } from './gallery'
import type { GroupKanbanNewRecordPosition } from './kanban'
import type { GroupRecordInsertTarget } from './operations'
import type { GroupTableOptions, GroupViewOptions } from './viewOptions'

export type GroupEditTarget =
  | {
      type: 'record'
      recordId: RecordId
    }
  | {
      type: 'records'
      recordIds: RecordId[]
    }

export type GroupValueApplyAction =
  | {
      type: 'set'
      property: PropertyId
      value: unknown
    }
  | {
      type: 'patch'
      patch: Record<string, unknown>
    }
  | {
      type: 'clear'
      property: PropertyId
    }

export interface GroupRecordCreateInput {
  id?: RecordId
  type?: string
  values?: Partial<Record<PropertyId, unknown>>
  meta?: Record<string, unknown>
}

export interface GroupPropertyCreateInput {
  id?: PropertyId
  name: string
  kind?: GroupPropertyKind
  config?: GroupPropertyConfig
  meta?: Record<string, unknown>
}

export interface GroupViewCreateInput {
  id?: ViewId
  name: string
  type: GroupViewType
  query?: GroupViewQuery
  aggregates?: GroupAggregateSpec[]
  options?: GroupViewOptions
  orders?: RecordId[]
}

export type GroupCommand =
  | {
      type: 'value.apply'
      target: GroupEditTarget
      action: GroupValueApplyAction
    }
  | {
      type: 'record.create'
      input: GroupRecordCreateInput
    }
  | {
      type: 'property.create'
      input: GroupPropertyCreateInput
    }
  | {
      type: 'view.create'
      input: GroupViewCreateInput
    }
  | {
      type: 'view.duplicate'
      viewId: ViewId
      name?: string
    }
  | {
      type: 'view.put'
      view: GroupView
    }
  | {
      type: 'view.rename'
      viewId: ViewId
      name: string
    }
  | {
      type: 'view.type.set'
      viewId: ViewId
      value: GroupViewType
    }
  | {
      type: 'view.query.set'
      viewId: ViewId
      query: GroupViewQuery
    }
  | {
      type: 'view.aggregates.set'
      viewId: ViewId
      aggregates: GroupAggregateSpec[]
    }
  | {
      type: 'view.display.setPropertyIds'
      viewId: ViewId
      propertyIds: PropertyId[]
    }
  | {
      type: 'view.table.setWidths'
      viewId: ViewId
      widths: GroupTableOptions['widths']
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
      value: GroupGalleryCardSize
    }
  | {
      type: 'view.kanban.setNewRecordPosition'
      viewId: ViewId
      value: GroupKanbanNewRecordPosition
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
      type: 'property.put'
      property: GroupProperty
    }
  | {
      type: 'property.convert'
      propertyId: PropertyId
      input: {
        kind: GroupPropertyKind
        config?: GroupPropertyConfig
      }
    }
  | {
      type: 'property.duplicate'
      propertyId: PropertyId
    }
  | {
      type: 'property.patch'
      propertyId: PropertyId
      patch: Partial<Omit<GroupProperty, 'id'>>
    }
  | {
      type: 'property.option.remove'
      propertyId: PropertyId
      optionId: string
    }
  | {
      type: 'property.option.create'
      propertyId: PropertyId
      input?: {
        name?: string
      }
    }
  | {
      type: 'property.option.reorder'
      propertyId: PropertyId
      optionIds: string[]
    }
  | {
      type: 'property.option.update'
      propertyId: PropertyId
      optionId: string
      patch: {
        name?: string
        color?: string
        category?: GroupStatusCategory
      }
    }
  | {
      type: 'property.remove'
      propertyId: PropertyId
    }
  | {
      type: 'external.bumpVersion'
      source: string
    }
  | {
      type: 'record.insertAt'
      records: GroupRecord[]
      target?: GroupRecordInsertTarget
    }
  | {
      type: 'record.apply'
      target: GroupEditTarget
      patch: Partial<Omit<GroupRecord, 'id'>>
    }
  | {
      type: 'record.remove'
      recordIds: RecordId[]
    }

export type GroupCommandType = GroupCommand['type']

export type GroupCommandPayload<TType extends GroupCommandType> = Omit<Extract<GroupCommand, { type: TType }>, 'type'>
