import type { CustomField } from '#core/contracts'
import {
  getKind,
  getFieldKind
} from '../kind'
import { normalizeSearchableValue } from '../kind/shared'

export const getFieldSearchTokens = (
  field: CustomField | undefined,
  value: unknown
): string[] => (
  (getFieldKind(field) ?? getKind('text')).search(field, value)
)

export {
  normalizeSearchableValue
}
