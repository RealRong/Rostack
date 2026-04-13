import type { EditTarget } from '@dataview/core/contracts'
import { unique } from '@shared/core'

export const uniqueRecordIds = (target: EditTarget): string[] => (
  target.type === 'record'
    ? [target.recordId]
    : unique(target.recordIds)
)
