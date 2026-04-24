import {
  DATAVIEW_OPERATION_META
} from '@dataview/core/operation/definition'
import {
  applyOperations
} from '@dataview/core/mutation/apply'
import {
  previewOperations
} from '@dataview/core/operation/previewOperations'

export type {
  DocumentApplyResult
} from '@dataview/core/mutation/apply'

export const operation = {
  meta: DATAVIEW_OPERATION_META,
  apply: applyOperations,
  preview: previewOperations
} as const
