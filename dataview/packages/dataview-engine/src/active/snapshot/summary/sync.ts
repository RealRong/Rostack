import type {
  FieldId,
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  buildFieldReducerState,
  createFieldReducerBuilder,
  getEmptyFieldReducerState,
  sameCalculationEntry,
  type CalculationEntry,
  type FieldReducerState,
  type ReducerCapabilitySet
} from '@dataview/engine/active/shared/calculation'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  ActiveImpact,
  EntryChange
} from '@dataview/engine/active/shared/impact'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import type { SectionKey } from '@dataview/engine/contracts/public'
import type {
  SectionState,
  SummaryDelta,
  SummaryFieldDelta,
  SummaryRecordDelta,
  SummaryState
} from '@dataview/engine/contracts/internal'
import {
  buildEmptySummaryState
} from '@dataview/engine/summary/empty'
import { readCalcFields } from '@dataview/engine/active/snapshot/summary/compute'

const EMPTY_FIELD_ENTRIES = new Map<RecordId, CalculationEntry>()
const EMPTY_FIELD_SUMMARIES = new Map<FieldId, FieldReducerState>()
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_RECORD_DELTAS = [] as readonly SummaryRecordDelta[]
const EMPTY_FIELD_DELTAS = new Map<FieldId, SummaryFieldDelta>()
const EMPTY_SUMMARY_DELTA: SummaryDelta = {
  rebuild: false,
  changed: [],
  removed: [],
  fields: new Map()
}

const buildSectionFieldState = (input: {
  sectionIds: readonly RecordId[]
  entries: ReadonlyMap<RecordId, CalculationEntry>
  capabilities: ReducerCapabilitySet
}): FieldReducerState => (
  input.sectionIds.length
    ? buildFieldReducerState({
        entries: input.entries,
        capabilities: input.capabilities,
        recordIds: input.sectionIds
      })
    : getEmptyFieldReducerState(input.capabilities)
)

const buildSummaryState = (input: {
  sections: SectionState
  view: View
  index: IndexState
}): SummaryState => {
  const calcFields = readCalcFields(input.view)
  const sectionKeys = input.sections.order.filter(
    sectionKey => input.sections.byKey.get(sectionKey) !== undefined
  )

  if (!calcFields.length) {
    return buildEmptySummaryState(sectionKeys) as SummaryState
  }

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>()

  input.sections.order.forEach(sectionKey => {
    const section = input.sections.byKey.get(sectionKey)
    if (!section) {
      return
    }

    const byField = new Map<FieldId, FieldReducerState>()
    calcFields.forEach(fieldId => {
      const fieldIndex = input.index.calculations.fields.get(fieldId)
      if (!fieldIndex) {
        return
      }

      byField.set(fieldId, buildSectionFieldState({
        sectionIds: section.recordIds,
        entries: fieldIndex.entries,
        capabilities: fieldIndex.capabilities
      }))
    })
    bySection.set(sectionKey, byField)
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

  const previousKeys = [...previous.bySection.keys()]
  return previousKeys.every((key, index) => key === nextSectionKeys[index])
}

const createSectionFieldBuilders = () => new Map<
  SectionKey,
  Map<FieldId, Map<RecordId, SummaryRecordDelta>>
>()

const ensureFieldBuilder = (input: {
  builders: Map<SectionKey, Map<FieldId, Map<RecordId, SummaryRecordDelta>>>
  sectionKey: SectionKey
  fieldId: FieldId
}) => {
  let byField = input.builders.get(input.sectionKey)
  if (!byField) {
    byField = new Map()
    input.builders.set(input.sectionKey, byField)
  }

  let byRecord = byField.get(input.fieldId)
  if (!byRecord) {
    byRecord = new Map()
    byField.set(input.fieldId, byRecord)
  }

  return byRecord
}

const applyRecordDelta = (input: {
  builders: Map<SectionKey, Map<FieldId, Map<RecordId, SummaryRecordDelta>>>
  sectionKey: SectionKey
  fieldId: FieldId
  recordId: RecordId
  previous?: CalculationEntry
  next?: CalculationEntry
}) => {
  if (sameCalculationEntry(input.previous, input.next)) {
    return
  }

  const byRecord = ensureFieldBuilder({
    builders: input.builders,
    sectionKey: input.sectionKey,
    fieldId: input.fieldId
  })
  const existing = byRecord.get(input.recordId)
  const merged: SummaryRecordDelta = {
    recordId: input.recordId,
    previous: existing?.previous ?? input.previous,
    next: existing?.next ?? input.next
  }

  if (sameCalculationEntry(merged.previous, merged.next)) {
    byRecord.delete(input.recordId)
    if (!byRecord.size) {
      const byField = input.builders.get(input.sectionKey)
      byField?.delete(input.fieldId)
      if (!byField?.size) {
        input.builders.delete(input.sectionKey)
      }
    }
    return
  }

  byRecord.set(input.recordId, merged)
}

const addSectionMembershipDelta = (input: {
  builders: Map<SectionKey, Map<FieldId, Map<RecordId, SummaryRecordDelta>>>
  sections?: ActiveImpact['sections']
  calcFields: readonly FieldId[]
  index: IndexState
}) => {
  if (!input.sections) {
    return
  }

  input.sections.removedByKey.forEach((recordIds, sectionKey) => {
    input.calcFields.forEach(fieldId => {
      const currentEntries = input.index.calculations.fields.get(fieldId)?.entries ?? EMPTY_FIELD_ENTRIES
      recordIds.forEach(recordId => {
        applyRecordDelta({
          builders: input.builders,
          sectionKey,
          fieldId,
          recordId,
          previous: currentEntries.get(recordId),
          next: undefined
        })
      })
    })
  })

  input.sections.addedByKey.forEach((recordIds, sectionKey) => {
    input.calcFields.forEach(fieldId => {
      const currentEntries = input.index.calculations.fields.get(fieldId)?.entries ?? EMPTY_FIELD_ENTRIES
      recordIds.forEach(recordId => {
        applyRecordDelta({
          builders: input.builders,
          sectionKey,
          fieldId,
          recordId,
          previous: undefined,
          next: currentEntries.get(recordId)
        })
      })
    })
  })
}

const addCalculationDelta = (input: {
  builders: Map<SectionKey, Map<FieldId, Map<RecordId, SummaryRecordDelta>>>
  fieldId: FieldId
  fieldChange: EntryChange<RecordId, CalculationEntry>
  previousSections: SectionState
  sections: SectionState
  index: IndexState
}) => {
  const currentEntries = input.index.calculations.fields.get(input.fieldId)?.entries ?? EMPTY_FIELD_ENTRIES

  input.fieldChange.changedIds.forEach(recordId => {
    const previousKeys = input.previousSections.keysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS
    const nextKeys = input.sections.keysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS
    const nextKeySet = new Set(nextKeys)
    const previousEntry = input.fieldChange.previousById.get(recordId)
      ?? readPreviousEntry(input.fieldChange, currentEntries, recordId)
    const nextEntry = input.fieldChange.nextById.get(recordId)
      ?? readNextEntry(input.fieldChange, currentEntries, recordId)

    previousKeys.forEach(sectionKey => {
      applyRecordDelta({
        builders: input.builders,
        sectionKey,
        fieldId: input.fieldId,
        recordId,
        previous: previousEntry,
        next: nextKeySet.has(sectionKey)
          ? nextEntry
          : undefined
      })
    })

    nextKeys.forEach(sectionKey => {
      if (previousKeys.includes(sectionKey)) {
        return
      }

      applyRecordDelta({
        builders: input.builders,
        sectionKey,
        fieldId: input.fieldId,
        recordId,
        previous: undefined,
        next: nextEntry
      })
    })
  })
}

const finalizeSummaryDelta = (input: {
  builders: Map<SectionKey, Map<FieldId, Map<RecordId, SummaryRecordDelta>>>
  previous?: SummaryState
  sections: SectionState
  rebuild: boolean
}): SummaryDelta => {
  const fields = new Map<SectionKey, ReadonlyMap<FieldId, SummaryFieldDelta>>()
  const changed: SectionKey[] = []

  input.builders.forEach((byField, sectionKey) => {
    if (!byField.size) {
      return
    }

    const fieldDeltas = new Map<FieldId, SummaryFieldDelta>()
    byField.forEach((byRecord, fieldId) => {
      if (!byRecord.size) {
        return
      }

      fieldDeltas.set(fieldId, {
        changes: [...byRecord.values()]
      })
    })

    if (!fieldDeltas.size) {
      return
    }

    fields.set(sectionKey, fieldDeltas)
    changed.push(sectionKey)
  })

  const previousKeys = input.previous
    ? [...input.previous.bySection.keys()]
    : EMPTY_SECTION_KEYS
  const removed = previousKeys.filter(sectionKey => !input.sections.byKey.has(sectionKey))

  if (!input.rebuild && !changed.length && !removed.length) {
    return EMPTY_SUMMARY_DELTA
  }

  return {
    rebuild: input.rebuild,
    changed,
    removed,
    fields
  }
}

export const buildSummaryDelta = (input: {
  previous?: SummaryState
  previousSections?: SectionState
  sections: SectionState
  index: IndexState
  calcFields: readonly FieldId[]
  impact: ActiveImpact
  action: 'reuse' | 'sync' | 'rebuild'
}): SummaryDelta => {
  if (
    !input.previous
    || !input.previousSections
    || input.action === 'rebuild'
    || input.impact.sections?.rebuild
  ) {
    return {
      rebuild: true,
      changed: input.sections.order.filter(sectionKey => input.sections.byKey.has(sectionKey)),
      removed: [],
      fields: new Map()
    }
  }

  if (!input.calcFields.length) {
    return finalizeSummaryDelta({
      builders: createSectionFieldBuilders(),
      previous: input.previous,
      sections: input.sections,
      rebuild: false
    })
  }

  const builders = createSectionFieldBuilders()
  let rebuild = false

  input.calcFields.forEach(fieldId => {
    const fieldChange = input.impact.calculations?.byField.get(fieldId)
    if (!fieldChange?.changedIds.size) {
      return
    }

    if (fieldChange.rebuild) {
      rebuild = true
      return
    }

    addCalculationDelta({
      builders,
      fieldId,
      fieldChange,
      previousSections: input.previousSections,
      sections: input.sections,
      index: input.index
    })
  })

  if (rebuild) {
    return {
      rebuild: true,
      changed: input.sections.order.filter(sectionKey => input.sections.byKey.has(sectionKey)),
      removed: [],
      fields: new Map()
    }
  }

  addSectionMembershipDelta({
    builders,
    sections: input.impact.sections,
    calcFields: input.calcFields,
    index: input.index
  })

  return finalizeSummaryDelta({
    builders,
    previous: input.previous,
    sections: input.sections,
    rebuild: false
  })
}

export const syncSummaryState = (input: {
  previous?: SummaryState
  sections: SectionState
  view: View
  index: IndexState
  action: 'reuse' | 'sync' | 'rebuild'
  delta: SummaryDelta
}): SummaryState => {
  const previousState = input.previous
  if (input.action === 'reuse' && previousState) {
    return previousState
  }

  const calcFields = readCalcFields(input.view)
  const sectionKeys = input.sections.order.filter(
    sectionKey => input.sections.byKey.get(sectionKey) !== undefined
  )

  if (!calcFields.length) {
    return buildEmptySummaryState(
      sectionKeys,
      previousState
    ) as SummaryState
  }

  if (
    !previousState
    || input.delta.rebuild
  ) {
    return buildSummaryState({
      sections: input.sections,
      view: input.view,
      index: input.index
    })
  }

  let changed = !sameSectionOrder(previousState, sectionKeys)
  if (!input.delta.changed.length && !input.delta.removed.length && !changed) {
    return previousState
  }

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>()

  sectionKeys.forEach(sectionKey => {
    const currentSection = input.sections.byKey.get(sectionKey)
    if (!currentSection) {
      return
    }

    const previousByField = previousState.bySection.get(sectionKey) ?? EMPTY_FIELD_SUMMARIES
    const sectionDelta = input.delta.fields.get(sectionKey) ?? EMPTY_FIELD_DELTAS
    if (!sectionDelta.size) {
      bySection.set(sectionKey, previousByField)
      return
    }

    const nextByField = createMapPatchBuilder(previousByField)

    calcFields.forEach(fieldId => {
      const fieldIndex = input.index.calculations.fields.get(fieldId)
      if (!fieldIndex) {
        nextByField.delete(fieldId)
        return
      }

      const previousFieldState = previousByField.get(fieldId)
      const fieldDelta = sectionDelta.get(fieldId)
      if (!fieldDelta) {
        return
      }

      if (!previousFieldState) {
        nextByField.set(fieldId, buildSectionFieldState({
          sectionIds: currentSection.recordIds,
          entries: fieldIndex.entries,
          capabilities: fieldIndex.capabilities
        }))
        return
      }

      const reducer = createFieldReducerBuilder({
        previous: previousFieldState,
        capabilities: fieldIndex.capabilities
      })
      let fieldChanged = false

      fieldDelta.changes.forEach(change => {
        fieldChanged = reducer.apply(change.previous, change.next) || fieldChanged
      })

      if (!fieldChanged) {
        return
      }

      nextByField.set(fieldId, reducer.finish())
    })

    const nextByFieldMap = nextByField.finish()
    bySection.set(sectionKey, nextByFieldMap)
    if (nextByFieldMap !== previousByField) {
      changed = true
    }
  })

  return changed
    ? {
        bySection
      }
    : previousState
}
