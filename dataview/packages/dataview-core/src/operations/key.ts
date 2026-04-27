import {
  key
} from '@shared/spec'
import type {
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/types'

export type DataviewTargetKey =
  | 'records'
  | `records.${RecordId}`
  | `records.${RecordId}.values.${FieldId}`
  | 'fields'
  | `fields.${FieldId}`
  | `fields.${FieldId}.values.${RecordId}`
  | 'views'
  | `views.${ViewId}`
  | 'activeView'
  | `external.${string}`

export type DataviewMutationKey = DataviewTargetKey
export const dataviewTargetKey = key.path()

export const serializeDataviewMutationKey = (
  mutationKey: DataviewMutationKey
): string => mutationKey

export const parseDataviewTargetKey = (
  key: DataviewTargetKey
): readonly string[] => dataviewTargetKey.read(key)

export const dataviewTargetKeyConflicts = (
  left: DataviewMutationKey,
  right: DataviewMutationKey
): boolean => dataviewTargetKey.conflicts(left, right)
