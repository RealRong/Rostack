import type { CustomField } from '#core/contracts/index.ts'
import {
  getKind,
  getFieldKind
} from '#core/field/kind/index.ts'
import { normalizeSearchableValue } from '#core/field/kind/shared.ts'

export const getFieldSearchTokens = (
  field: CustomField | undefined,
  value: unknown
): string[] => (
  (getFieldKind(field) ?? getKind('text')).search(field, value)
)

export {
  normalizeSearchableValue
}
