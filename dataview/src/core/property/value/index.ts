import type {
  GroupProperty
} from '../../contracts/state'
import {
  getKind,
  getPropertyKind
} from '../kind'
import type { PropertyDraftParseResult } from '../kind/shared'
export type { PropertyDraftParseResult } from '../kind/shared'
export {
  isEmptyPropertyValue,
  normalizePropertyToken,
  normalizeSearchableValue,
  readBooleanValue,
  readNumberValue
} from '../kind/shared'

export const parsePropertyDraft = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  draft: string
): PropertyDraftParseResult => (
  (getPropertyKind(property) ?? getKind('text')).parseDraft(property, draft)
)

export const getPropertyDisplayValue = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  value: unknown
): string | undefined => (
  (getPropertyKind(property) ?? getKind('text')).display(property, value)
)
