import type {
  CustomField
} from '../../contracts/state'
import {
  getKind,
  getFieldKind
} from '../kind'
import type { FieldDraftParseResult } from '../kind/shared'
export type { FieldDraftParseResult } from '../kind/shared'
export {
  isEmptyFieldValue,
  normalizeFieldToken,
  normalizeSearchableValue,
  readBooleanValue,
  readNumberValue
} from '../kind/shared'

export const parseCustomFieldDraft = (
  field: CustomField | undefined,
  draft: string
): FieldDraftParseResult => (
  (getFieldKind(field) ?? getKind('text')).parseDraft(field, draft)
)

export const getCustomFieldDisplayValue = (
  field: CustomField | undefined,
  value: unknown
): string | undefined => (
  (getFieldKind(field) ?? getKind('text')).display(field, value)
)
