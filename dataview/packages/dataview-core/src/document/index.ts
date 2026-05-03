import { createDocument } from '@dataview/core/document/create'
import { documentDocument } from '@dataview/core/document/normalize'

export const document = {
  create: createDocument,
  normalize: documentDocument.normalize,
  clone: documentDocument.clone
} as const
