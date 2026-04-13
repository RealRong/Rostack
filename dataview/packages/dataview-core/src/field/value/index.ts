import type {
  CustomField
} from '#core/contracts/state'
import {
  getKind,
  getFieldKind
} from '#core/field/kind/index'
import type { FieldDraftParseResult } from '#core/field/kind/shared'
export type { FieldDraftParseResult } from '#core/field/kind/shared'
export {
  isEmptyFieldValue,
  normalizeFieldToken,
  normalizeSearchableValue,
  readBooleanValue,
  readNumberValue
} from '#core/field/kind/shared'

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
