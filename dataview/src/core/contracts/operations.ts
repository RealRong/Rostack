import type { PropertyId, GroupProperty, GroupRecord, GroupView, RecordId, ViewId } from './state'

export interface GroupRecordInsertTarget {
  index?: number
}

export type GroupValuePatch = Partial<Record<PropertyId, unknown>>

export type GroupBaseOperation =
  | {
      type: 'document.record.insert'
      records: GroupRecord[]
      target?: GroupRecordInsertTarget
    }
  | {
      type: 'document.record.patch'
      recordId: RecordId
      patch: Partial<Omit<GroupRecord, 'id'>>
    }
  | {
      type: 'document.record.remove'
      recordIds: RecordId[]
    }
  | {
      type: 'document.value.set'
      recordId: RecordId
      property: PropertyId
      value: unknown
    }
  | {
      type: 'document.value.patch'
      recordId: RecordId
      patch: GroupValuePatch
    }
  | {
      type: 'document.value.clear'
      recordId: RecordId
      property: PropertyId
    }
  | {
      type: 'document.view.put'
      view: GroupView
    }
  | {
      type: 'document.view.remove'
      viewId: ViewId
    }
  | {
      type: 'document.property.put'
      property: GroupProperty
    }
  | {
      type: 'document.property.patch'
      propertyId: PropertyId
      patch: Partial<Omit<GroupProperty, 'id'>>
    }
  | {
      type: 'document.property.remove'
      propertyId: PropertyId
    }
  | {
      type: 'external.version.bump'
      source: string
    }

export type GroupOperationType = GroupBaseOperation['type']

export type GroupOperationPayload<TType extends GroupOperationType> = Omit<Extract<GroupBaseOperation, { type: TType }>, 'type'>
