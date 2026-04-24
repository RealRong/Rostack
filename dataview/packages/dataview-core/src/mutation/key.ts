import type {
  Path
} from '@shared/mutation'
import {
  path as mutationPath
} from '@shared/mutation'
import type {
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/contracts'

export type DataviewMutationKey = Path

export const dataviewMutationKey = {
  recordsOrder: (): DataviewMutationKey => mutationPath.of('records', 'order'),
  record: (recordId: RecordId): DataviewMutationKey => mutationPath.of('records', recordId),
  recordField: (recordId: RecordId, fieldId: FieldId): DataviewMutationKey => mutationPath.of('records', recordId, 'values', fieldId),
  fieldValues: (fieldId: FieldId, recordId: RecordId): DataviewMutationKey => mutationPath.of('fields', fieldId, 'values', recordId),
  fieldsOrder: (): DataviewMutationKey => mutationPath.of('fields', 'order'),
  field: (fieldId: FieldId): DataviewMutationKey => mutationPath.of('fields', fieldId),
  viewsOrder: (): DataviewMutationKey => mutationPath.of('views', 'order'),
  view: (viewId: ViewId): DataviewMutationKey => mutationPath.of('views', viewId),
  activeView: (): DataviewMutationKey => mutationPath.of('activeView'),
  external: (source: string): DataviewMutationKey => mutationPath.of('external', source)
} as const

export const serializeDataviewMutationKey = (
  mutationKey: DataviewMutationKey
): string => mutationPath.toString(mutationKey)

export const dataviewMutationKeyConflicts = (
  left: DataviewMutationKey,
  right: DataviewMutationKey
): boolean => mutationPath.overlaps(left, right)
