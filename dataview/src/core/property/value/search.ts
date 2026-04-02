import type { GroupProperty } from '@/core/contracts'
import {
  getKind,
  getPropertyKind
} from '../kind'
import { normalizeSearchableValue } from '../kind/shared'

export const getPropertySearchTokens = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  value: unknown
): string[] => (
  (getPropertyKind(property) ?? getKind('text')).search(property, value)
)

export {
  normalizeSearchableValue
}
