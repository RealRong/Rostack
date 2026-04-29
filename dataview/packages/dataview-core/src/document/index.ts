import { createDocument } from '@dataview/core/document/create'
import { documentDocument } from '@dataview/core/document/normalize'

export const document = {
  create: createDocument,
  normalize: documentDocument.normalize,
  clone: documentDocument.clone
} as const

export { DEFAULT_SCHEMA_VERSION } from '@dataview/core/document/create'
export type {
  AppliedDocumentRecordFieldWrite
} from '@dataview/core/document/recordFieldWriteKernel'
export type {
  DocumentRecordFieldWriteResult
} from '@dataview/core/document/records'
