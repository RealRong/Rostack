import { entityTable } from '@shared/core'
import type { DataDoc } from '@dataview/core/types'

export const createDocument = (input?: {
  meta?: Record<string, unknown>
}): DataDoc => ({
  records: entityTable.normalize.list([]),
  fields: entityTable.normalize.list([]),
  views: entityTable.normalize.list([]),
  activeViewId: undefined,
  meta: Object.prototype.hasOwnProperty.call(input ?? {}, 'meta')
    ? (input?.meta ? structuredClone(input.meta) : input?.meta)
    : undefined
})
