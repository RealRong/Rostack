import { document as documentApi } from '@whiteboard/core/document'

export const normalizeDocument = (
  document: unknown
) => {
  return documentApi.assert(document)
}
