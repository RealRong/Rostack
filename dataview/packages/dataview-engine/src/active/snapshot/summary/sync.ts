import type {
  CalculationEntry,
  FieldReducerState,
  ReducerCapabilitySet
} from '@dataview/core/calculation'
import {
  calculation
} from '@dataview/core/calculation'
import {
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  ActiveImpact,
  EntryChange
} from '@dataview/engine/active/shared/impact'
import {
  sameSectionKeys
} from '@dataview/engine/active/shared/sections'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import type {
  SectionKey
} from '@dataview/engine/contracts/public'
import type {
  SectionState,
  SummaryDelta,
  SummaryState
} from '@dataview/engine/contracts/internal'
import {
  buildEmptySummaryState
} from '@dataview/engine/summary/empty'

const EMPTY_FIELD_ENTRIES = new Map<RecordId, CalculationEntry>()
const EMPTY_FIELD_SUMMARIES = new Map<FieldId, FieldReducerState>()
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_SECTION_TRANSITIONS = [] as readonly RecordSectionTransition[]
const EMPTY_SECTION_TRANSITION_MAP = new Map<RecordId, RecordSectionTransition>()
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
    ? calculation.reducer.state.build({
        entries: input.entries,
        capabilities: input.capabilities,
        recordIds: input.sectionIds
      })
    : calculation.reducer.empty(input.capabilities)
)

const collectSectionKeys = (
  sections: SectionState
): readonly SectionKey[] => sections.order.filter(
  sectionKey => sections.byKey.get(sectionKey) !== undefined
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
  sections: SectionState
  calcFields: readonly FieldId[]
  index: IndexState
}): SummaryState => {
  const sectionKeys = collectSectionKeys(input.sections)
  if (!input.calcFields.length) {
    return buildEmptySummaryState(sectionKeys) as SummaryState
  }

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>()
  sectionKeys.forEach(sectionKey => {
    const section = input.sections.byKey.get(sectionKey)
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
  change: EntryChange<RecordId, CalculationEntry> | undefined,
  currentEntries: ReadonlyMap<RecordId, CalculationEntry>,
  recordId: RecordId
): CalculationEntry | undefined => {
  if (change?.previousById.has(recordId)) {
    return change.previousById.get(recordId)
  }

  return currentEntries.get(recordId)
}

const readNextEntry = (
  change: EntryChange<RecordId, CalculationEntry> | undefined,
  currentEntries: ReadonlyMap<RecordId, CalculationEntry>,
  recordId: RecordId
): CalculationEntry | undefined => {
  if (change?.nextById.has(recordId)) {
    return change.nextById.get(recordId)
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
  sections: SectionState
}): readonly SectionKey[] => {
  const removed: SectionKey[] = []

  input.previous.bySection.forEach((_value, sectionKey) => {
    if (!input.sections.byKey.has(sectionKey)) {
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
  previousSections: SectionState
  impact: ActiveImpact
}): {
  all: readonly RecordSectionTransition[]
  byRecord: ReadonlyMap<RecordId, RecordSectionTransition>
} => {
  const changed = input.impact.sections?.nextKeysByItem
  if (!changed?.size) {
    return {
      all: EMPTY_SECTION_TRANSITIONS,
      byRecord: EMPTY_SECTION_TRANSITION_MAP
    }
  }

  const all: RecordSectionTransition[] = []
  const byRecord = new Map<RecordId, RecordSectionTransition>()

  changed.forEach((afterKeys, recordId) => {
    const transition: RecordSectionTransition = {
      recordId,
      beforeKeys: input.previousSections.keysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS,
      afterKeys
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
  Map<FieldId, ReturnType<typeof calculation.reducer.state.builder>>
>()

const ensureSectionFieldBuilder = (input: {
  builders: Map<SectionKey, Map<FieldId, ReturnType<typeof calculation.reducer.state.builder>>>
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
    ?? calculation.reducer.empty(input.capabilities)
  const created = calculation.reducer.state.builder({
    previous: previousFieldState,
    capabilities: input.capabilities
  })

  byField.set(input.fieldId, created)
  return created
}

const applySectionFieldChange = (input: {
  builders: Map<SectionKey, Map<FieldId, ReturnType<typeof calculation.reducer.state.builder>>>
  previous: SummaryState
  sections: SectionState
  sectionKey: SectionKey
  fieldId: FieldId
  capabilities: ReducerCapabilitySet
  previousEntry?: CalculationEntry
  nextEntry?: CalculationEntry
}) => {
  if (
    !input.sections.byKey.has(input.sectionKey)
    || calculation.reducer.entry.same(input.previousEntry, input.nextEntry)
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
  builders: Map<SectionKey, Map<FieldId, ReturnType<typeof calculation.reducer.state.builder>>>
  previous: SummaryState
  sections: SectionState
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

  if (!calculation.reducer.entry.same(input.previousEntry, input.nextEntry)) {
    if (!beforeCount && afterCount === 1) {
      applySectionFieldChange({
        builders: input.builders,
        previous: input.previous,
        sections: input.sections,
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
        sections: input.sections,
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
          sections: input.sections,
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
        sections: input.sections,
        sectionKey: beforeKey,
        fieldId: input.fieldId,
        capabilities: input.capabilities,
        previousEntry: input.previousEntry,
        nextEntry: undefined
      })
      applySectionFieldChange({
        builders: input.builders,
        previous: input.previous,
        sections: input.sections,
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
          sections: input.sections,
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
      sections: input.sections,
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
      sections: input.sections,
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
  previousSections: SectionState
  sections: SectionState
  calcFields: readonly FieldId[]
  index: IndexState
  impact: ActiveImpact
}): {
  state: SummaryState
  delta: SummaryDelta
} => {
  const sectionKeys = collectSectionKeys(input.sections)
  const removed = collectRemovedSections({
    previous: input.previous,
    sections: input.sections
  })
  const orderChanged = !sameSectionOrder(input.previous, sectionKeys)
  const sectionTransitions = collectSectionTransitions({
    previousSections: input.previousSections,
    impact: input.impact
  })
  const builders = createSectionFieldBuilders()

  input.calcFields.forEach(fieldId => {
    const fieldChange = input.impact.calculations?.byField.get(fieldId)
    if (!fieldChange?.changedIds.size && !sectionTransitions.all.length) {
      return
    }

    const fieldIndex = input.index.calculations.fields.get(fieldId)
    if (!fieldIndex) {
      return
    }

    const currentEntries = fieldIndex.entries ?? EMPTY_FIELD_ENTRIES
    const changedIds = fieldChange?.changedIds

    if (changedIds?.size) {
      for (const recordId of changedIds) {
        const transition = sectionTransitions.byRecord.get(recordId)
        const stableKeys = transition
          ? undefined
          : input.sections.keysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS

        applyFieldRecordChange({
          builders,
          previous: input.previous,
          sections: input.sections,
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
        sections: input.sections,
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
    const section = input.sections.byKey.get(sectionKey)
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
  previousSections?: SectionState
  sections: SectionState
  calcFields: readonly FieldId[]
  index: IndexState
  impact: ActiveImpact
  action: 'reuse' | 'sync' | 'rebuild'
}): {
  state: SummaryState
  delta: SummaryDelta
} => {
  const previousState = input.previous
  const sectionKeys = collectSectionKeys(input.sections)

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
      || !input.previousSections
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
      sections: input.sections
    })
    const changed = sectionKeys.filter(sectionKey => !previousState.bySection.has(sectionKey))

    return {
      state,
      delta: createSummaryDelta({
        rebuild: false,
        changed,
        removed
      })
    }
  }

  if (
    !previousState
    || !input.previousSections
    || input.action === 'rebuild'
  ) {
    return {
      state: buildSummaryState({
        sections: input.sections,
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
    previousSections: input.previousSections,
    sections: input.sections,
    calcFields: input.calcFields,
    index: input.index,
    impact: input.impact
  })
}
