import { documentFields } from '@dataview/core/document/fields'
import { documentRecords } from '@dataview/core/document/records'
import { documentViews } from '@dataview/core/document/views'

export { cloneDocument, normalizeDocument } from '@dataview/core/document/normalize'
export * from '@dataview/core/document/table'
export type {
  AppliedDocumentRecordFieldWrite,
  DocumentRecordFieldWriteResult
} from '@dataview/core/document/records'

export const document = {
  fields: documentFields,
  records: documentRecords,
  views: documentViews
} as const
