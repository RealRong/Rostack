import type { DataDoc, Field, FieldId } from '@dataview/core/contracts'
import { getDocumentFieldById } from '@dataview/core/document'

export const readDocumentFieldById = (
  document: DataDoc,
  fieldId: FieldId
): Field | undefined => getDocumentFieldById(document, fieldId)
