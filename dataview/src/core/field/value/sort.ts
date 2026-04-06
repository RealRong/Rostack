import type { CustomField } from '@dataview/core/contracts'
import {
  getKind,
  getFieldKind
} from '../kind'

export const compareFieldValues = (
  field: CustomField | undefined,
  left: unknown,
  right: unknown
): number => (
  (getFieldKind(field) ?? getKind('text')).compare(field, left, right)
)
