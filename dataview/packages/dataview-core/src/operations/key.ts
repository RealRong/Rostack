import {
  splitDotKey
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

const isSharedPrefix = (
  left: readonly string[],
  right: readonly string[]
): boolean => {
  const size = Math.min(left.length, right.length)
  for (let index = 0; index < size; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

export const serializeDataviewMutationKey = (
  mutationKey: DataviewMutationKey
): string => mutationKey

export const parseDataviewTargetKey = (
  key: DataviewTargetKey
): readonly string[] => splitDotKey(key)

export const dataviewTargetKeyConflicts = (
  left: DataviewMutationKey,
  right: DataviewMutationKey
): boolean => isSharedPrefix(
  parseDataviewTargetKey(left),
  parseDataviewTargetKey(right)
)
