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
  type FieldReducerState
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
import type {
  SectionMembershipResolver
} from '@dataview/engine/active/shared/sections'
import type { SectionKey } from '@dataview/engine/contracts/public'
import type {
  SectionState,
  SummaryState
} from '@dataview/engine/contracts/internal'
import {
  buildEmptySummaryState
} from '@dataview/engine/summary/empty'
import { readCalcFields } from '@dataview/engine/active/snapshot/summary/compute'

const EMPTY_FIELD_ENTRIES = new Map<RecordId, CalculationEntry>()
const EMPTY_FIELD_SUMMARIES = new Map<FieldId, FieldReducerState>()

const buildSectionFieldState = (input: {
  sectionIds: readonly RecordId[]
  entries: ReadonlyMap<RecordId, CalculationEntry>
  capabilities: import('@dataview/engine/active/shared/calculation').ReducerCapabilitySet
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

const addTouchedSectionKeys = (
  target: Set<SectionKey>,
  keys?: Iterable<SectionKey>
) => {
  if (!keys) {
    return
  }

  for (const key of keys) {
    target.add(key)
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

const collectTouchedSections = (input: {
  impact: ActiveImpact
  resolver: SectionMembershipResolver
  calcFields: readonly FieldId[]
}): ReadonlySet<SectionKey> => {
  const touched = new Set<SectionKey>()
  addTouchedSectionKeys(touched, input.impact.sections?.touchedKeys)

  input.calcFields.forEach(fieldId => {
    const fieldChange = input.impact.calculations?.byField.get(fieldId)
    if (!fieldChange?.changedIds.size) {
      return
    }

    fieldChange.changedIds.forEach(recordId => {
      input.resolver.keysOf(recordId).forEach(key => touched.add(key))
    })
  })

  return touched
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

export const syncSummaryState = (input: {
  previous?: SummaryState
  sections: SectionState
  resolver: SectionMembershipResolver
  view: View
  index: IndexState
  impact: ActiveImpact
  action: 'reuse' | 'sync' | 'rebuild'
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
    !input.previous
    || input.action === 'rebuild'
  ) {
    return buildSummaryState({
      sections: input.sections,
      view: input.view,
      index: input.index
    })
  }

  const previous = input.previous
  const touchedSections = collectTouchedSections({
    impact: input.impact,
    resolver: input.resolver,
    calcFields
  })
  let changed = !sameSectionOrder(previous, sectionKeys)

  if (!touchedSections.size && !changed) {
    return previous
  }

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>()

  input.sections.order.forEach(sectionKey => {
    const currentSection = input.sections.byKey.get(sectionKey)
    if (!currentSection) {
      return
    }

    const previousByField = previous.bySection.get(sectionKey) ?? EMPTY_FIELD_SUMMARIES
    if (!touchedSections.has(sectionKey)) {
      bySection.set(sectionKey, previousByField)
      return
    }

    const removedBySection = input.impact.sections?.removedByKey.get(sectionKey)
    const addedBySection = input.impact.sections?.addedByKey.get(sectionKey)
    const nextByField = createMapPatchBuilder(previousByField)

    calcFields.forEach(fieldId => {
      const fieldIndex = input.index.calculations.fields.get(fieldId)
      if (!fieldIndex) {
        nextByField.delete(fieldId)
        return
      }

      const currentEntries = fieldIndex.entries ?? EMPTY_FIELD_ENTRIES
      const previousFieldState = previousByField.get(fieldId)

      if (!previousFieldState) {
        nextByField.set(fieldId, buildSectionFieldState({
          sectionIds: currentSection.recordIds,
          entries: currentEntries,
          capabilities: fieldIndex.capabilities
        }))
        return
      }

      const fieldChange = input.impact.calculations?.byField.get(fieldId)
      const reducer = createFieldReducerBuilder({
        previous: previousFieldState,
        capabilities: fieldIndex.capabilities
      })
      let fieldChanged = false
      let processed: Set<RecordId> | undefined

      removedBySection?.forEach(recordId => {
        if (fieldChange?.changedIds.size) {
          processed ??= new Set<RecordId>()
          processed.add(recordId)
        }
        const previousEntry = fieldChange
          ? readPreviousEntry(fieldChange, currentEntries, recordId)
          : currentEntries.get(recordId)
        if (!previousEntry) {
          return
        }

        fieldChanged = reducer.apply(previousEntry, undefined) || fieldChanged
      })

      addedBySection?.forEach(recordId => {
        if (fieldChange?.changedIds.size) {
          processed ??= new Set<RecordId>()
          processed.add(recordId)
        }
        const nextEntry = fieldChange
          ? readNextEntry(fieldChange, currentEntries, recordId)
          : currentEntries.get(recordId)
        if (!nextEntry) {
          return
        }

        fieldChanged = reducer.apply(undefined, nextEntry) || fieldChanged
      })

      fieldChange?.changedIds.forEach(recordId => {
        if (processed?.has(recordId) || !input.resolver.has(recordId, sectionKey)) {
          return
        }

        const previousEntry = fieldChange.previousById.get(recordId)
        const nextEntry = fieldChange.nextById.get(recordId)
        fieldChanged = reducer.apply(previousEntry, nextEntry) || fieldChanged
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
    : previous
}
