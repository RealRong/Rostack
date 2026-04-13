import type { CustomField } from '#core/contracts/index.ts'
import {
  getKind,
  getFieldKind
} from '#core/field/kind/index.ts'

export const compareFieldValues = (
  field: CustomField | undefined,
  left: unknown,
  right: unknown
): number => (
  (getFieldKind(field) ?? getKind('text')).compare(field, left, right)
)
