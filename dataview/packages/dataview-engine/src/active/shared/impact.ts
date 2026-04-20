import {
  collectSchemaFieldIds,
  collectTouchedFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds,
  hasRecordSetChange
} from '@dataview/core/commit/impact'
import type {
  CommitImpact,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  sameOrder
} from '@shared/core'
import type {
  CalculationEntry
} from '@dataview/core/calculation'
import type {
  BucketKey
} from '@dataview/engine/active/index/contracts'
import type {
  SectionKey
} from '@dataview/engine/contracts/public'

export interface ActiveImpactBase {
  touchedRecords: ReadonlySet<RecordId> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
  valueFields: ReadonlySet<FieldId> | 'all'
  schemaFields: ReadonlySet<FieldId>
  recordSetChanged: boolean
}

export interface ActiveQueryImpact {
  rebuild?: true
  visibleAdded: RecordId[]
  visibleRemoved: RecordId[]
  orderChanged?: true
}

export interface MembershipChange<TKey extends string, TItem extends string> {
  rebuild?: true
  touchedKeys: Set<TKey>
  addedByKey: Map<TKey, TItem[]>
  removedByKey: Map<TKey, TItem[]>
  nextKeysByItem: Map<TItem, readonly TKey[]>
}

export interface EntryChange<TId extends string, TEntry> {
  rebuild?: true
  changedIds: Set<TId>
  previousById: Map<TId, TEntry | undefined>
  nextById: Map<TId, TEntry | undefined>
}

export interface ActiveCalculationImpact {
  byField: Map<FieldId, EntryChange<RecordId, CalculationEntry>>
}

export interface ActiveImpact {
  commit: CommitImpact
  base: ActiveImpactBase
  query?: ActiveQueryImpact
  bucket?: MembershipChange<BucketKey, RecordId>
  sections?: MembershipChange<SectionKey, RecordId>
  calculations?: ActiveCalculationImpact
}

const pushToArrayMap = <TKey, TValue>(
  map: Map<TKey, TValue[]>,
  key: TKey,
  value: TValue
) => {
  const current = map.get(key)
  if (current) {
    current.push(value)
    return
  }

  map.set(key, [value])
}

const createMembershipChange = <TKey extends string, TItem extends string>(): MembershipChange<TKey, TItem> => ({
  touchedKeys: new Set<TKey>(),
  addedByKey: new Map<TKey, TItem[]>(),
  removedByKey: new Map<TKey, TItem[]>(),
  nextKeysByItem: new Map<TItem, readonly TKey[]>()
})

const createEntryChange = <TId extends string, TEntry>(): EntryChange<TId, TEntry> => ({
  changedIds: new Set<TId>(),
  previousById: new Map<TId, TEntry | undefined>(),
  nextById: new Map<TId, TEntry | undefined>()
})

export const createActiveImpact = (
  commit: CommitImpact
): ActiveImpact => ({
  commit,
  base: {
    touchedRecords: collectTouchedRecordIds(commit),
    touchedFields: collectTouchedFieldIds(commit, {
      includeTitlePatch: true
    }),
    valueFields: collectValueFieldIds(commit, {
      includeTitlePatch: true
    }),
    schemaFields: collectSchemaFieldIds(commit),
    recordSetChanged: hasRecordSetChange(commit)
  }
})

export const ensureQueryImpact = (
  impact: ActiveImpact
): ActiveQueryImpact => {
  if (impact.query) {
    return impact.query
  }

  impact.query = {
    visibleAdded: [],
    visibleRemoved: []
  }
  return impact.query
}

export const ensureBucketChange = (
  impact: ActiveImpact
): MembershipChange<BucketKey, RecordId> => {
  if (impact.bucket) {
    return impact.bucket
  }

  impact.bucket = createMembershipChange<BucketKey, RecordId>()
  return impact.bucket
}

export const ensureSectionChange = (
  impact: ActiveImpact
): MembershipChange<SectionKey, RecordId> => {
  if (impact.sections) {
    return impact.sections
  }

  impact.sections = createMembershipChange<SectionKey, RecordId>()
  return impact.sections
}

export const ensureCalculationFieldChange = (
  impact: ActiveImpact,
  fieldId: FieldId
): EntryChange<RecordId, CalculationEntry> => {
  if (!impact.calculations) {
    impact.calculations = {
      byField: new Map()
    }
  }

  const existing = impact.calculations.byField.get(fieldId)
  if (existing) {
    return existing
  }

  const created = createEntryChange<RecordId, CalculationEntry>()
  impact.calculations.byField.set(fieldId, created)
  return created
}

export const applyMembershipTransition = <TKey extends string, TItem extends string>(
  change: MembershipChange<TKey, TItem>,
  itemId: TItem,
  before: readonly TKey[],
  after: readonly TKey[]
): void => {
  if (sameOrder(before, after)) {
    return
  }

  if (after.length) {
    change.nextKeysByItem.set(itemId, after)
  } else {
    change.nextKeysByItem.delete(itemId)
  }

  before.forEach(key => {
    change.touchedKeys.add(key)
    if (!after.includes(key)) {
      pushToArrayMap(change.removedByKey, key, itemId)
    }
  })
  after.forEach(key => {
    change.touchedKeys.add(key)
    if (!before.includes(key)) {
      pushToArrayMap(change.addedByKey, key, itemId)
    }
  })
}

export const applyEntryChange = <TId extends string, TEntry>(
  change: EntryChange<TId, TEntry>,
  id: TId,
  previous: TEntry | undefined,
  next: TEntry | undefined,
  equal: (left: TEntry | undefined, right: TEntry | undefined) => boolean
): void => {
  if (equal(previous, next)) {
    return
  }

  change.changedIds.add(id)
  change.previousById.set(id, previous)
  change.nextById.set(id, next)
}

export const hasQueryChanges = (
  impact: ActiveImpact
): boolean => Boolean(
  impact.query?.rebuild
  || impact.query?.orderChanged
  || impact.query?.visibleAdded.length
  || impact.query?.visibleRemoved.length
)

export const hasMembershipChanges = <TKey extends string, TItem extends string>(
  change: MembershipChange<TKey, TItem> | undefined
): boolean => Boolean(
  change?.rebuild
  || change?.touchedKeys.size
)

export const hasCalculationChanges = (
  impact: ActiveImpact,
  fieldIds?: Iterable<FieldId>
): boolean => {
  const calculations = impact.calculations
  if (!calculations?.byField.size) {
    return false
  }

  if (!fieldIds) {
    return true
  }

  for (const fieldId of fieldIds) {
    const change = calculations.byField.get(fieldId)
    if (change?.rebuild || change?.changedIds.size) {
      return true
    }
  }

  return false
}
