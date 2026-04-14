import type { CustomField } from '@dataview/core/contracts'
import {
  getKind,
  getFieldKind
} from '@dataview/core/field/kind'
import { normalizeSearchableValue } from '@dataview/core/field/kind/shared'

export const getFieldSearchTokens = (
  field: CustomField | undefined,
  value: unknown
): string[] => (
  (getFieldKind(field) ?? getKind('text')).search(field, value)
)

export {
  normalizeSearchableValue
}
