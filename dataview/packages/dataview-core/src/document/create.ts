import { entityTable } from '@shared/core'
import type { DataDoc } from '@dataview/core/types'

export const DEFAULT_SCHEMA_VERSION = 1

export const createDocument = (input?: {
  schemaVersion?: number
  meta?: Record<string, unknown>
}): DataDoc => ({
  schemaVersion: input?.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
  records: entityTable.normalize.list([]),
  fields: entityTable.normalize.list([]),
  views: entityTable.normalize.list([]),
  ...(Object.prototype.hasOwnProperty.call(input ?? {}, 'meta')
    ? {
        meta: input?.meta ? structuredClone(input.meta) : input?.meta
      }
    : {})
})
