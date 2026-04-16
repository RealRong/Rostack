import type {
  FieldId,
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  buildAggregateState,
  buildAggregateStateForRecordIds,
  createAggregateBuilder,
  sameAggregateEntry
} from '@dataview/engine/active/index/aggregate'
import type {
  AggregateState,
  AggregateEntry,
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
  SummaryState
} from '@dataview/engine/contracts/internal'
import {
  buildEmptySummaryState
} from '@dataview/engine/summary/empty'
import { readCalcFields } from '@dataview/engine/active/snapshot/summary/compute'

const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_FIELD_ENTRIES = new Map<RecordId, AggregateEntry>()
const EMPTY_FIELD_SUMMARIES = new Map<FieldId, AggregateState>()
const EMPTY_FIELD_STATE = buildAggregateState(EMPTY_FIELD_ENTRIES)

const buildSectionFieldState = (input: {
  sectionIds: readonly RecordId[]
  entries: ReadonlyMap<RecordId, AggregateEntry>
}): AggregateState => {
  if (!input.entries.size || !input.sectionIds.length) {
    return EMPTY_FIELD_STATE
  }

  const next = buildAggregateStateForRecordIds({
    recordIds: input.sectionIds,
    entries: input.entries
  })

  return next.count
    ? next
    : EMPTY_FIELD_STATE
}

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

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, AggregateState>>()

  input.sections.order.forEach(sectionKey => {
    const section = input.sections.byKey.get(sectionKey)
    if (!section) {
      return
    }

    const byField = new Map<FieldId, AggregateState>()
    calcFields.forEach(fieldId => {
      const entries = input.index.calculations.fields.get(fieldId)?.entries
      if (!entries) {
        return
      }

      byField.set(fieldId, buildSectionFieldState({
        sectionIds: section.recordIds,
        entries
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
  change: EntryChange<RecordId, AggregateEntry> | undefined,
  currentEntries: ReadonlyMap<RecordId, AggregateEntry>,
  recordId: RecordId
): AggregateEntry | undefined => {
  if (change?.previousById.has(recordId)) {
    return change.previousById.get(recordId)
  }

  return currentEntries.get(recordId)
}

const readNextEntry = (
  change: EntryChange<RecordId, AggregateEntry> | undefined,
  currentEntries: ReadonlyMap<RecordId, AggregateEntry>,
  recordId: RecordId
): AggregateEntry | undefined => {
  if (change?.nextById.has(recordId)) {
    return change.nextById.get(recordId)
  }

  return currentEntries.get(recordId)
}

const collectTouchedSections = (input: {
  impact: ActiveImpact
  sections: SectionState
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
      const keys = input.sections.byRecord.get(recordId) ?? EMPTY_SECTION_KEYS
      keys.forEach(key => touched.add(key))
    })
  })

  return touched
}

export const syncSummaryState = (input: {
  previous?: SummaryState
  sections: SectionState
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

  if (!calcFields.length) {
    return buildEmptySummaryState(
      input.sections.order.filter(sectionKey => input.sections.byKey.get(sectionKey) !== undefined),
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
    sections: input.sections,
    calcFields
  })
  let changed = previous.bySection.size !== input.sections.order.length

  if (!touchedSections.size && !changed) {
    return previous
  }

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, AggregateState>>()

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
      const currentEntries = input.index.calculations.fields.get(fieldId)?.entries ?? EMPTY_FIELD_ENTRIES
      const previousFieldState = previousByField.get(fieldId)
      const fieldChange = input.impact.calculations?.byField.get(fieldId)

      if (!previousFieldState) {
        nextByField.set(fieldId, buildSectionFieldState({
          sectionIds: currentSection.recordIds,
          entries: currentEntries
        }))
        return
      }

      const aggregate = createAggregateBuilder(previousFieldState)
      let fieldChanged = false
      const processed = new Set<RecordId>()

      removedBySection?.forEach(recordId => {
        processed.add(recordId)
        const previousEntry = readPreviousEntry(fieldChange, currentEntries, recordId)
        if (!previousEntry) {
          return
        }

        fieldChanged = true
        aggregate.apply(previousEntry, undefined)
      })

      addedBySection?.forEach(recordId => {
        processed.add(recordId)
        const nextEntry = readNextEntry(fieldChange, currentEntries, recordId)
        if (!nextEntry) {
          return
        }

        fieldChanged = true
        aggregate.apply(undefined, nextEntry)
      })

      fieldChange?.changedIds.forEach(recordId => {
        if (processed.has(recordId)) {
          return
        }

        const sectionKeys = input.sections.byRecord.get(recordId) ?? EMPTY_SECTION_KEYS
        if (!sectionKeys.includes(sectionKey)) {
          return
        }

        const previousEntry = fieldChange.previousById.get(recordId)
        const nextEntry = fieldChange.nextById.get(recordId)
        if (sameAggregateEntry(previousEntry, nextEntry)) {
          return
        }

        fieldChanged = true
        aggregate.apply(previousEntry, nextEntry)
      })

      if (!fieldChanged) {
        return
      }

      nextByField.set(fieldId, aggregate.finish())
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
