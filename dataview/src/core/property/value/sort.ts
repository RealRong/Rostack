import type { GroupProperty } from '@/core/contracts'
import {
  getKind,
  getPropertyKind
} from '../kind'

export const comparePropertyValues = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  left: unknown,
  right: unknown
): number => (
  (getPropertyKind(property) ?? getKind('text')).compare(property, left, right)
)
