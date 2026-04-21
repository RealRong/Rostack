import type {
  CalculationEntry,
  FieldReducerState,
  ReducerCapabilitySet
} from '@dataview/core/calculation'
import {
  calculation
} from '@dataview/core/calculation'
import { equal } from '@shared/core'
import {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  ActiveImpact,
  EntryTransition
} from '@dataview/engine/active/shared/impact'
import {
  entryRead
} from '@dataview/engine/active/shared/impact'
import {
  sameSectionKeys
} from '@dataview/engine/active/shared/sections'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import type {
  SectionKey
} from '@dataview/engine/contracts'
import type {
  MembershipDelta,
  MembershipState,
  SummaryDelta,
  SummaryState
} from '@dataview/engine/contracts/state'
import {
  buildEmptySummaryState
} from '@dataview/engine/summary/empty'

const EMPTY_FIELD_ENTRIES = new Map<RecordId, CalculationEntry>()
const EMPTY_FIELD_SUMMARIES = new Map<FieldId, FieldReducerState>()
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_SECTION_TRANSITIONS = [] as readonly RecordSectionTransition[]
const EMPTY_SECTION_TRANSITION_MAP = new Map<RecordId, RecordSectionTransition>()
const EMPTY_SECTION_KEY_SET = new Set<SectionKey>()
const EMPTY_MEMBERSHIP_DELTA: MembershipDelta = {
  rebuild: false,
  orderChanged: false,
  changed: [],
  removed: [],
  records: new Map()
}
const EMPTY_SUMMARY_DELTA: SummaryDelta = {
  rebuild: false,
  changed: [],
  removed: []
}

interface RecordSectionTransition {
  recordId: RecordId
  beforeKeys: readonly SectionKey[]
  afterKeys: readonly SectionKey[]
}

const buildSectionFieldState = (input: {
  sectionIds: readonly RecordId[]
  entries: ReadonlyMap<RecordId, CalculationEntry>
  capabilities: ReducerCapabilitySet
}): FieldReducerState => (
  input.sectionIds.length
    ? calculation.state.build({
        entries: input.entries,
        capabilities: input.capabilities,
        recordIds: input.sectionIds
      })
    : calculation.state.empty(input.capabilities)
)

const collectSectionKeys = (
  membership: MembershipState
): readonly SectionKey[] => membership.order.filter(
  sectionKey => membership.byKey.get(sectionKey) !== undefined
)

const buildSectionSummaryFields = (input: {
  sectionIds: readonly RecordId[]
  calcFields: readonly FieldId[]
  index: IndexState
}): ReadonlyMap<FieldId, FieldReducerState> => {
  const byField = new Map<FieldId, FieldReducerState>()

  input.calcFields.forEach(fieldId => {
    const fieldIndex = input.index.calculations.fields.get(fieldId)
    if (!fieldIndex) {
      return
    }

    byField.set(fieldId, buildSectionFieldState({
      sectionIds: input.sectionIds,
      entries: fieldIndex.entries,
      capabilities: fieldIndex.capabilities
    }))
  })

  return byField.size
    ? byField
    : EMPTY_FIELD_SUMMARIES
}

const buildSummaryState = (input: {
  membership: MembershipState
  calcFields: readonly FieldId[]
  index: IndexState
}): SummaryState => {
  const sectionKeys = collectSectionKeys(input.membership)
  if (!input.calcFields.length) {
    return buildEmptySummaryState(sectionKeys) as SummaryState
  }

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>()
  sectionKeys.forEach(sectionKey => {
    const section = input.membership.byKey.get(sectionKey)
    if (!section) {
      return
    }

    bySection.set(sectionKey, buildSectionSummaryFields({
      sectionIds: section.recordIds,
      calcFields: input.calcFields,
      index: input.index
    }))
  })

  return {
    bySection
  }
}

const readPreviousEntry = (
  transition: EntryTransition<RecordId, CalculationEntry> | undefined,
  currentEntries: ReadonlyMap<RecordId, CalculationEntry>,
  recordId: RecordId
): CalculationEntry | undefined => {
  const previous = entryRead.before(transition, recordId)
  if (transition?.records.has(recordId)) {
    return previous
  }

  return currentEntries.get(recordId)
}

const readNextEntry = (
  transition: EntryTransition<RecordId, CalculationEntry> | undefined,
  currentEntries: ReadonlyMap<RecordId, CalculationEntry>,
  recordId: RecordId
): CalculationEntry | undefined => {
  const next = entryRead.after(transition, recordId)
  if (transition?.records.has(recordId)) {
    return next
  }

  return currentEntries.get(recordId)
}

const sameSectionOrder = (
  previous: SummaryState,
  nextSectionKeys: readonly SectionKey[]
) => {
  if (previous.bySection.size !== nextSectionKeys.length) {
    return false
  }

  let index = 0
  for (const key of previous.bySection.keys()) {
    if (key !== nextSectionKeys[index]) {
      return false
    }
    index += 1
  }

  return true
}

const collectRemovedSections = (input: {
  previous: SummaryState
  membership: MembershipState
}): readonly SectionKey[] => {
  const removed: SectionKey[] = []

  input.previous.bySection.forEach((_value, sectionKey) => {
    if (!input.membership.byKey.has(sectionKey)) {
      removed.push(sectionKey)
    }
  })

  return removed
}

const createSummaryDelta = (input: {
  rebuild: boolean
  changed: ReadonlySet<SectionKey> | readonly SectionKey[]
  removed: readonly SectionKey[]
}): SummaryDelta => {
  if (input.rebuild) {
    return {
      rebuild: true,
      changed: Array.isArray(input.changed)
        ? input.changed
        : [...input.changed],
      removed: input.removed
    }
  }

  const changed = Array.isArray(input.changed)
    ? input.changed
    : [...input.changed]
  if (!changed.length && !input.removed.length) {
    return EMPTY_SUMMARY_DELTA
  }

  return {
    rebuild: false,
    changed,
    removed: input.removed
  }
}

const collectSectionTransitions = (input: {
  previousMembership: MembershipState
  membershipDelta: Pick<MembershipDelta, 'records'>
}): {
  all: readonly RecordSectionTransition[]
  byRecord: ReadonlyMap<RecordId, RecordSectionTransition>
} => {
  if (!input.membershipDelta.records.size) {
    return {
      all: EMPTY_SECTION_TRANSITIONS,
      byRecord: EMPTY_SECTION_TRANSITION_MAP
    }
  }

  const all: RecordSectionTransition[] = []
  const byRecord = new Map<RecordId, RecordSectionTransition>()

  input.membershipDelta.records.forEach(({ before, after }, recordId) => {
    const transition: RecordSectionTransition = {
      recordId,
      beforeKeys: before.length
        ? before
        : input.previousMembership.keysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS,
      afterKeys: after
    }
    all.push(transition)
    byRecord.set(recordId, transition)
  })

  return {
    all,
    byRecord
  }
}

const createSectionFieldBuilders = () => new Map<
  SectionKey,
  Map<FieldId, ReturnType<typeof calculation.state.builder>>
>()

const collectSectionRecordIdChanges = (input: {
  previousMembership: MembershipState
  membership: MembershipState
}): ReadonlySet<SectionKey> => {
  const changed = new Set<SectionKey>()

  input.membership.order.forEach(sectionKey => {
    const previous = input.previousMembership.byKey.get(sectionKey)
    const next = input.membership.byKey.get(sectionKey)
    if (!previous || !next) {
      return
    }

    if (previous.recordIds === next.recordIds) {
      return
    }

    if (previous.recordIds.length !== next.recordIds.length) {
      changed.add(sectionKey)
      return
    }

    if (equal.sameOrder(previous.recordIds, next.recordIds)) {
      return
    }

    const previousRecordIdSet = new Set(previous.recordIds)
    for (let index = 0; index < next.recordIds.length; index += 1) {
      if (!previousRecordIdSet.has(next.recordIds[index]!)) {
        changed.add(sectionKey)
        return
      }
    }
  })

  return changed
}

const ensureSectionFieldBuilder = (input: {
  builders: Map<SectionKey, Map<FieldId, ReturnType<typeof calculation.state.builder>>>
  previous: SummaryState
  sectionKey: SectionKey
  fieldId: FieldId
  capabilities: ReducerCapabilitySet
}) => {
  let byField = input.builders.get(input.sectionKey)
  if (!byField) {
    byField = new Map()
    input.builders.set(input.sectionKey, byField)
  }

  const existing = byField.get(input.fieldId)
  if (existing) {
    return existing
  }

  const previousFieldState = input.previous.bySection.get(input.sectionKey)?.get(input.fieldId)
    ?? calculation.state.empty(input.capabilities)
  const created = calculation.state.builder({
    previous: previousFieldState,
    capabilities: input.capabilities
  })

  byField.set(input.fieldId, created)
  return created
}

const applySectionFieldChange = (input: {
  builders: Map<SectionKey, Map<FieldId, ReturnType<typeof calculation.state.builder>>>
  previous: SummaryState
  membership: MembershipState
  sectionKey: SectionKey
  fieldId: FieldId
  capabilities: ReducerCapabilitySet
  previousEntry?: CalculationEntry
  nextEntry?: CalculationEntry
}) => {
  if (
    !input.membership.byKey.has(input.sectionKey)
    || calculation.entry.same(input.previousEntry, input.nextEntry)
  ) {
    return
  }

  ensureSectionFieldBuilder({
    builders: input.builders,
    previous: input.previous,
    sectionKey: input.sectionKey,
    fieldId: input.fieldId,
    capabilities: input.capabilities
  }).apply(input.previousEntry, input.nextEntry)
}

const applyFieldRecordChange = (input: {
  builders: Map<SectionKey, Map<FieldId, ReturnType<typeof calculation.state.builder>>>
  previous: SummaryState
  membership: MembershipState
  fieldId: FieldId
  capabilities: ReducerCapabilitySet
  beforeKeys: readonly SectionKey[]
  afterKeys: readonly SectionKey[]
  previousEntry?: CalculationEntry
  nextEntry?: CalculationEntry
}) => {
  const beforeCount = input.beforeKeys.length
  const afterCount = input.afterKeys.length

  if (!beforeCount && !afterCount) {
    return
  }

  if (!calculation.entry.same(input.previousEntry, input.nextEntry)) {
    if (!beforeCount && afterCount === 1) {
      applySectionFieldChange({
        builders: input.builders,
        previous: input.previous,
        membership: input.membership,
        sectionKey: input.afterKeys[0]!,
        fieldId: input.fieldId,
        capabilities: input.capabilities,
        previousEntry: undefined,
        nextEntry: input.nextEntry
      })
      return
    }

    if (beforeCount === 1 && !afterCount) {
      applySectionFieldChange({
        builders: input.builders,
        previous: input.previous,
        membership: input.membership,
        sectionKey: input.beforeKeys[0]!,
        fieldId: input.fieldId,
        capabilities: input.capabilities,
        previousEntry: input.previousEntry,
        nextEntry: undefined
      })
      return
    }

    if (beforeCount === 1 && afterCount === 1) {
      const beforeKey = input.beforeKeys[0]!
      const afterKey = input.afterKeys[0]!
      if (beforeKey === afterKey) {
        applySectionFieldChange({
          builders: input.builders,
          previous: input.previous,
          membership: input.membership,
          sectionKey: beforeKey,
          fieldId: input.fieldId,
          capabilities: input.capabilities,
          previousEntry: input.previousEntry,
          nextEntry: input.nextEntry
        })
        return
      }

      applySectionFieldChange({
        builders: input.builders,
        previous: input.previous,
        membership: input.membership,
        sectionKey: beforeKey,
        fieldId: input.fieldId,
        capabilities: input.capabilities,
        previousEntry: input.previousEntry,
        nextEntry: undefined
      })
      applySectionFieldChange({
        builders: input.builders,
        previous: input.previous,
        membership: input.membership,
        sectionKey: afterKey,
        fieldId: input.fieldId,
        capabilities: input.capabilities,
        previousEntry: undefined,
        nextEntry: input.nextEntry
      })
      return
    }

    if (beforeCount === afterCount && sameSectionKeys(input.beforeKeys, input.afterKeys)) {
      for (let index = 0; index < beforeCount; index += 1) {
        applySectionFieldChange({
          builders: input.builders,
          previous: input.previous,
          membership: input.membership,
          sectionKey: input.beforeKeys[index]!,
          fieldId: input.fieldId,
          capabilities: input.capabilities,
          previousEntry: input.previousEntry,
          nextEntry: input.nextEntry
        })
      }
      return
    }
  }

  for (let index = 0; index < beforeCount; index += 1) {
    const sectionKey = input.beforeKeys[index]!
    applySectionFieldChange({
      builders: input.builders,
      previous: input.previous,
      membership: input.membership,
      sectionKey,
      fieldId: input.fieldId,
      capabilities: input.capabilities,
      previousEntry: input.previousEntry,
      nextEntry: input.afterKeys.includes(sectionKey)
        ? input.nextEntry
        : undefined
    })
  }

  for (let index = 0; index < afterCount; index += 1) {
    const sectionKey = input.afterKeys[index]!
    if (input.beforeKeys.includes(sectionKey)) {
      continue
    }

    applySectionFieldChange({
      builders: input.builders,
      previous: input.previous,
      membership: input.membership,
      sectionKey,
      fieldId: input.fieldId,
      capabilities: input.capabilities,
      previousEntry: undefined,
      nextEntry: input.nextEntry
    })
  }
}

const deriveSyncedSummaryState = (input: {
  previous: SummaryState
  previousMembership: MembershipState
  membership: MembershipState
  membershipDelta: MembershipDelta
  calcFields: readonly FieldId[]
  index: IndexState
  impact: ActiveImpact
}): {
  state: SummaryState
  delta: SummaryDelta
} => {
  const sectionKeys = collectSectionKeys(input.membership)
  const removed = collectRemovedSections({
    previous: input.previous,
    membership: input.membership
  })
  const orderChanged = !sameSectionOrder(input.previous, sectionKeys)
  const sectionTransitions = collectSectionTransitions({
    previousMembership: input.previousMembership,
    membershipDelta: input.membershipDelta
  })
  const sectionRecordIdChanges = sectionTransitions.all.length
    ? EMPTY_SECTION_KEY_SET
    : collectSectionRecordIdChanges({
        previousMembership: input.previousMembership,
        membership: input.membership
      })
  const builders = createSectionFieldBuilders()

  input.calcFields.forEach(fieldId => {
    const fieldChange = input.impact.calculation?.fields.get(fieldId)
    if (!fieldChange?.records.size && !sectionTransitions.all.length) {
      return
    }

    const fieldIndex = input.index.calculations.fields.get(fieldId)
    if (!fieldIndex) {
      return
    }

    const currentEntries = fieldIndex.entries ?? EMPTY_FIELD_ENTRIES
    const changedIds = fieldChange?.records

    if (changedIds?.size) {
      for (const recordId of changedIds.keys()) {
        const transition = sectionTransitions.byRecord.get(recordId)
        const stableKeys = transition
          ? undefined
          : input.membership.keysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS

        applyFieldRecordChange({
          builders,
          previous: input.previous,
          membership: input.membership,
          fieldId,
          capabilities: fieldIndex.capabilities,
          beforeKeys: transition?.beforeKeys ?? stableKeys!,
          afterKeys: transition?.afterKeys ?? stableKeys!,
          previousEntry: readPreviousEntry(fieldChange, currentEntries, recordId),
          nextEntry: readNextEntry(fieldChange, currentEntries, recordId)
        })
      }
    }

    if (!sectionTransitions.all.length) {
      return
    }

    for (let index = 0; index < sectionTransitions.all.length; index += 1) {
      const transition = sectionTransitions.all[index]!
      if (changedIds?.has(transition.recordId)) {
        continue
      }

      const currentEntry = currentEntries.get(transition.recordId)
      applyFieldRecordChange({
        builders,
        previous: input.previous,
        membership: input.membership,
        fieldId,
        capabilities: fieldIndex.capabilities,
        beforeKeys: transition.beforeKeys,
        afterKeys: transition.afterKeys,
        previousEntry: currentEntry,
        nextEntry: currentEntry
      })
    }
  })

  const changedSections = new Set<SectionKey>()
  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>()
  let stateChanged = orderChanged || removed.length > 0

  sectionKeys.forEach(sectionKey => {
    const section = input.membership.byKey.get(sectionKey)
    if (!section) {
      return
    }

    const previousByField = input.previous.bySection.get(sectionKey)
    if (!previousByField) {
      const nextByField = buildSectionSummaryFields({
        sectionIds: section.recordIds,
        calcFields: input.calcFields,
        index: input.index
      })
      bySection.set(sectionKey, nextByField)
      changedSections.add(sectionKey)
      stateChanged = true
      return
    }

    if (sectionRecordIdChanges.has(sectionKey)) {
      const nextByField = buildSectionSummaryFields({
        sectionIds: section.recordIds,
        calcFields: input.calcFields,
        index: input.index
      })
      bySection.set(sectionKey, nextByField)
      if (nextByField !== previousByField) {
        changedSections.add(sectionKey)
        stateChanged = true
      }
      return
    }

    const fieldBuilders = builders.get(sectionKey)
    if (!fieldBuilders?.size) {
      bySection.set(sectionKey, previousByField)
      return
    }

    const nextByField = createMapPatchBuilder(previousByField)
    fieldBuilders.forEach((builder, fieldId) => {
      const nextFieldState = builder.finish()
      if (nextFieldState !== previousByField.get(fieldId)) {
        nextByField.set(fieldId, nextFieldState)
      }
    })

    const nextByFieldMap = nextByField.finish()
    bySection.set(sectionKey, nextByFieldMap)
    if (nextByFieldMap !== previousByField) {
      changedSections.add(sectionKey)
      stateChanged = true
    }
  })

  return {
    state: stateChanged
      ? {
          bySection
        }
      : input.previous,
    delta: createSummaryDelta({
      rebuild: false,
      changed: changedSections,
      removed
    })
  }
}

export const deriveSummaryState = (input: {
  previous?: SummaryState
  previousMembership?: MembershipState
  membership: MembershipState
  membershipDelta?: MembershipDelta
  calcFields: readonly FieldId[]
  index: IndexState
  impact: ActiveImpact
  action: 'reuse' | 'sync' | 'rebuild'
}): {
  state: SummaryState
  delta: SummaryDelta
} => {
  const previousState = input.previous
  const membershipDelta = input.membershipDelta ?? EMPTY_MEMBERSHIP_DELTA
  const sectionKeys = collectSectionKeys(input.membership)

  if (input.action === 'reuse' && previousState) {
    return {
      state: previousState,
      delta: EMPTY_SUMMARY_DELTA
    }
  }

  if (!input.calcFields.length) {
    const state = buildEmptySummaryState(sectionKeys, previousState) as SummaryState
    if (
      !previousState
      || !input.previousMembership
      || input.action === 'rebuild'
    ) {
      return {
        state,
        delta: createSummaryDelta({
          rebuild: true,
          changed: sectionKeys,
          removed: []
        })
      }
    }

    const removed = collectRemovedSections({
      previous: previousState,
      membership: input.membership
    })
    const changed = sectionKeys.filter(sectionKey => !previousState.bySection.has(sectionKey))

    return {
      state,
        delta: createSummaryDelta({
          rebuild: false,
          changed: membershipDelta.orderChanged
            ? sectionKeys
            : changed,
          removed
        })
    }
  }

  if (
    !previousState
    || !input.previousMembership
    || input.action === 'rebuild'
  ) {
    return {
      state: buildSummaryState({
        membership: input.membership,
        calcFields: input.calcFields,
        index: input.index
      }),
      delta: createSummaryDelta({
        rebuild: true,
        changed: sectionKeys,
        removed: []
      })
    }
  }

  return deriveSyncedSummaryState({
    previous: previousState,
    previousMembership: input.previousMembership,
    membership: input.membership,
    membershipDelta,
    calcFields: input.calcFields,
    index: input.index,
    impact: input.impact
  })
}
