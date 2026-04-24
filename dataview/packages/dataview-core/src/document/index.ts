import { documentDocument } from '@dataview/core/document/normalize'
import { documentFields } from '@dataview/core/document/fields'
import { documentRecords } from '@dataview/core/document/records'
import { documentValues } from '@dataview/core/document/values'
import { documentViews } from '@dataview/core/document/views'

export type {
  AppliedDocumentRecordFieldWrite,
  DocumentRecordFieldWriteResult
} from '@dataview/core/document/records'

export const document = {
  ...documentDocument,
  fields: documentFields,
  records: documentRecords,
  values: documentValues,
  views: documentViews
} as const
