import type {
  CalculationEntry
} from '@dataview/core/calculation'
import type {
  FieldId,
  RecordId
} from '@dataview/core/contracts'

export interface MembershipRecord<TKey extends string> {
  before: readonly TKey[]
  after: readonly TKey[]
}

export interface MembershipTransition<TKey extends string, TItem extends string> {
  rebuild?: true
  records: Map<TItem, MembershipRecord<TKey>>
}

export interface EntryRecord<TEntry> {
  before: TEntry | undefined
  after: TEntry | undefined
}

export interface EntryTransition<TId extends string, TEntry> {
  rebuild?: true
  records: Map<TId, EntryRecord<TEntry>>
}

export interface CalculationTransition {
  fields: Map<FieldId, EntryTransition<RecordId, CalculationEntry>>
}

export const createMembershipTransition = <TKey extends string, TItem extends string>(): MembershipTransition<TKey, TItem> => ({
  records: new Map<TItem, MembershipRecord<TKey>>()
})

export const createEntryTransition = <TId extends string, TEntry>(): EntryTransition<TId, TEntry> => ({
  records: new Map<TId, EntryRecord<TEntry>>()
})

export const createCalculationTransition = (): CalculationTransition => ({
  fields: new Map()
})

export const ensureCalculationFieldTransition = (
  transition: CalculationTransition,
  fieldId: FieldId
): EntryTransition<RecordId, CalculationEntry> => {
  const existing = transition.fields.get(fieldId)
  if (existing) {
    return existing
  }

  const created = createEntryTransition<RecordId, CalculationEntry>()
  transition.fields.set(fieldId, created)
  return created
}

export const applyMembershipTransition = <TKey extends string, TItem extends string>(
  transition: MembershipTransition<TKey, TItem>,
  itemId: TItem,
  before: readonly TKey[],
  after: readonly TKey[]
): void => {
  if (
    before.length === after.length
    && before.every((value, index) => value === after[index])
  ) {
    return
  }

  transition.records.set(itemId, {
    before,
    after
  })
}

export const applyEntryTransition = <TId extends string, TEntry>(
  transition: EntryTransition<TId, TEntry>,
  id: TId,
  previous: TEntry | undefined,
  next: TEntry | undefined,
  isEqual: (left: TEntry | undefined, right: TEntry | undefined) => boolean
): void => {
  if (isEqual(previous, next)) {
    return
  }

  transition.records.set(id, {
    before: previous,
    after: next
  })
}

export const hasMembershipChanges = <TKey extends string, TItem extends string>(
  transition: MembershipTransition<TKey, TItem> | undefined
): boolean => Boolean(
  transition?.rebuild
  || transition?.records.size
)

export const hasCalculationChanges = (
  transition: CalculationTransition | undefined,
  fieldIds?: Iterable<FieldId>
): boolean => {
  if (!transition?.fields.size) {
    return false
  }

  if (!fieldIds) {
    return true
  }

  for (const fieldId of fieldIds) {
    const fieldTransition = transition.fields.get(fieldId)
    if (fieldTransition?.rebuild || fieldTransition?.records.size) {
      return true
    }
  }

  return false
}
