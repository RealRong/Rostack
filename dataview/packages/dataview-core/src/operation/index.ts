import {
  DATAVIEW_OPERATION_META
} from '@dataview/core/operation/definition'
import {
  applyOperations
} from '@dataview/core/mutation/apply'

export type {
  DocumentApplyResult
} from '@dataview/core/mutation/apply'

export const operation = {
  meta: DATAVIEW_OPERATION_META,
  apply: applyOperations
} as const
