import {
  impact as commitImpact
} from '@dataview/core/commit/impact'
import type {
  CommitImpact,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  CalculationEntry
} from '@dataview/core/calculation'
import { equal } from '@shared/core'
import type {
  BucketKey
} from '@dataview/engine/active/index/contracts'

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

export interface ActiveCalculationImpact {
  fields: Map<FieldId, EntryTransition<RecordId, CalculationEntry>>
}

export interface ActiveImpact {
  commit: CommitImpact
  base: ActiveImpactBase
  query?: ActiveQueryImpact
  bucket?: MembershipTransition<BucketKey, RecordId>
  calculation?: ActiveCalculationImpact
}

const createMembershipTransition = <TKey extends string, TItem extends string>(): MembershipTransition<TKey, TItem> => ({
  records: new Map<TItem, MembershipRecord<TKey>>()
})

const createEntryTransition = <TId extends string, TEntry>(): EntryTransition<TId, TEntry> => ({
  records: new Map<TId, EntryRecord<TEntry>>()
})

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

export const createActiveImpact = (
  commit: CommitImpact
): ActiveImpact => ({
  commit,
  base: {
    touchedRecords: commitImpact.record.touchedIds(commit),
    touchedFields: commitImpact.field.touchedIds(commit, {
      includeTitlePatch: true
    }),
    valueFields: commitImpact.field.valueIds(commit, {
      includeTitlePatch: true
    }),
    schemaFields: commitImpact.field.schemaIds(commit),
    recordSetChanged: commitImpact.has.recordSetChange(commit)
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

export const ensureBucketTransition = (
  impact: ActiveImpact
): MembershipTransition<BucketKey, RecordId> => {
  if (impact.bucket) {
    return impact.bucket
  }

  impact.bucket = createMembershipTransition<BucketKey, RecordId>()
  return impact.bucket
}

export const ensureCalculationFieldTransition = (
  impact: ActiveImpact,
  fieldId: FieldId
): EntryTransition<RecordId, CalculationEntry> => {
  if (!impact.calculation) {
    impact.calculation = {
      fields: new Map()
    }
  }

  const existing = impact.calculation.fields.get(fieldId)
  if (existing) {
    return existing
  }

  const created = createEntryTransition<RecordId, CalculationEntry>()
  impact.calculation.fields.set(fieldId, created)
  return created
}

export const applyMembershipTransition = <TKey extends string, TItem extends string>(
  transition: MembershipTransition<TKey, TItem>,
  itemId: TItem,
  before: readonly TKey[],
  after: readonly TKey[]
): void => {
  if (equal.sameOrder(before, after)) {
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

export const membershipRead = {
  records: <TKey extends string, TItem extends string>(
    transition: MembershipTransition<TKey, TItem> | undefined
  ) => transition?.records,
  before: <TKey extends string, TItem extends string>(
    transition: MembershipTransition<TKey, TItem> | undefined,
    itemId: TItem
  ): readonly TKey[] | undefined => transition?.records.get(itemId)?.before,
  after: <TKey extends string, TItem extends string>(
    transition: MembershipTransition<TKey, TItem> | undefined,
    itemId: TItem
  ): readonly TKey[] | undefined => transition?.records.get(itemId)?.after,
  keyChanges: <TKey extends string, TItem extends string>(
    transition: MembershipTransition<TKey, TItem> | undefined
  ): {
    touched: ReadonlySet<TKey>
    added: ReadonlyMap<TKey, readonly TItem[]>
    removed: ReadonlyMap<TKey, readonly TItem[]>
  } => {
    const touched = new Set<TKey>()
    const added = new Map<TKey, TItem[]>()
    const removed = new Map<TKey, TItem[]>()

    transition?.records.forEach(({ before, after }, itemId) => {
      before.forEach(key => {
        touched.add(key)
        if (!after.includes(key)) {
          pushToArrayMap(removed, key, itemId)
        }
      })
      after.forEach(key => {
        touched.add(key)
        if (!before.includes(key)) {
          pushToArrayMap(added, key, itemId)
        }
      })
    })

    return {
      touched,
      added,
      removed
    }
  }
}

export const entryRead = {
  before: <TId extends string, TEntry>(
    transition: EntryTransition<TId, TEntry> | undefined,
    id: TId
  ): TEntry | undefined => transition?.records.get(id)?.before,
  after: <TId extends string, TEntry>(
    transition: EntryTransition<TId, TEntry> | undefined,
    id: TId
  ): TEntry | undefined => transition?.records.get(id)?.after
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
  transition: MembershipTransition<TKey, TItem> | undefined
): boolean => Boolean(
  transition?.rebuild
  || transition?.records.size
)

export const hasCalculationChanges = (
  impact: ActiveImpact,
  fieldIds?: Iterable<FieldId>
): boolean => {
  const calculation = impact.calculation
  if (!calculation?.fields.size) {
    return false
  }

  if (!fieldIds) {
    return true
  }

  for (const fieldId of fieldIds) {
    const transition = calculation.fields.get(fieldId)
    if (transition?.rebuild || transition?.records.size) {
      return true
    }
  }

  return false
}
