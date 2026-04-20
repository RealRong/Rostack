import { documentDocument } from '@dataview/core/document/normalize'
import { documentFields } from '@dataview/core/document/fields'
import { documentRecords } from '@dataview/core/document/records'
import { entityTable } from '@dataview/core/document/table'
import { documentViews } from '@dataview/core/document/views'

export type {
  AppliedDocumentRecordFieldWrite,
  DocumentRecordFieldWriteResult
} from '@dataview/core/document/records'

export const document = {
  ...documentDocument,
  table: entityTable,
  fields: documentFields,
  records: documentRecords,
  views: documentViews
} as const
