import {
  META
} from '@dataview/core/operation/meta'
import {
  applyOperations
} from '@dataview/core/operation/applyOperations'
import {
  previewOperations
} from '@dataview/core/operation/previewOperations'

export type {
  DocumentApplyResult
} from '@dataview/core/operation/applyOperations'

export const operation = {
  meta: META,
  apply: applyOperations,
  preview: previewOperations
} as const
