import type { CustomField } from '#core/contracts'
import {
  getKind,
  getFieldKind
} from '#core/field/kind/index'

export const compareFieldValues = (
  field: CustomField | undefined,
  left: unknown,
  right: unknown
): number => (
  (getFieldKind(field) ?? getKind('text')).compare(field, left, right)
)
