import type {
  FieldId,
  RecordId,
  View
} from '@dataview/core/contracts'
import { sameOrder } from '@shared/core'
import {
  buildSectionAggregateState,
  createAggregateBuilder,
  sameAggregateEntry
} from '@dataview/engine/active/index/aggregate'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/index/builder'
import type {
  AggregateEntry,
  IndexState,
  SectionAggregateState
} from '@dataview/engine/active/index/contracts'
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
const EMPTY_FIELD_SUMMARIES = new Map<FieldId, SectionAggregateState>()
const EMPTY_FIELD_STATE = buildSectionAggregateState(EMPTY_FIELD_ENTRIES)

const buildSectionFieldState = (input: {
  sectionIds: readonly RecordId[]
  entries: ReadonlyMap<RecordId, AggregateEntry>
}): SectionAggregateState => {
  if (!input.entries.size || !input.sectionIds.length) {
    return EMPTY_FIELD_STATE
  }

  const next = new Map<RecordId, AggregateEntry>()
  input.sectionIds.forEach(recordId => {
    const entry = input.entries.get(recordId)
    if (entry) {
      next.set(recordId, entry)
    }
  })

  return next.size
    ? buildSectionAggregateState(next)
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

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, SectionAggregateState>>()

  input.sections.order.forEach(sectionKey => {
    const section = input.sections.byKey.get(sectionKey)
    if (!section) {
      return
    }

    const byField = new Map<FieldId, SectionAggregateState>()
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

const isRecordInSection = (
  sections: SectionState,
  sectionKey: SectionKey,
  recordId: RecordId
) => (sections.byRecord.get(recordId) ?? EMPTY_SECTION_KEYS).includes(sectionKey)

const collectTouchedSectionRecords = (input: {
  previousSections: SectionState
  sections: SectionState
  touchedRecords: ReadonlySet<RecordId>
}) => {
  const recordsBySection = new Map<SectionKey, RecordId[]>()
  const membershipChanged = new Set<SectionKey>()
  const addRecord = (
    sectionKey: SectionKey,
    recordId: RecordId
  ) => {
    const ids = recordsBySection.get(sectionKey)
    if (ids) {
      ids.push(recordId)
      return
    }

    recordsBySection.set(sectionKey, [recordId])
  }

  input.touchedRecords.forEach(recordId => {
    const previousKeys = input.previousSections.byRecord.get(recordId) ?? EMPTY_SECTION_KEYS
    const nextKeys = input.sections.byRecord.get(recordId) ?? EMPTY_SECTION_KEYS

    previousKeys.forEach(sectionKey => {
      addRecord(sectionKey, recordId)
    })
    nextKeys.forEach(sectionKey => {
      if (!previousKeys.includes(sectionKey)) {
        addRecord(sectionKey, recordId)
      }
    })

    if (sameOrder(previousKeys, nextKeys)) {
      return
    }

    previousKeys.forEach(sectionKey => membershipChanged.add(sectionKey))
    nextKeys.forEach(sectionKey => membershipChanged.add(sectionKey))
  })

  return {
    recordsBySection,
    membershipChanged
  }
}

export const syncSummaryState = (input: {
  previous?: SummaryState
  previousSections?: SectionState
  sections: SectionState
  view: View
  index: IndexState
  action: 'reuse' | 'sync' | 'rebuild'
  touchedRecords: ReadonlySet<string> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
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
    || !input.previousSections
    || input.action === 'rebuild'
    || input.touchedRecords === 'all'
    || input.touchedFields === 'all'
  ) {
    return buildSummaryState({
      sections: input.sections,
      view: input.view,
      index: input.index
    })
  }

  const previous = input.previous
  const previousSections = input.previousSections
  const touchedRecords = input.touchedRecords as ReadonlySet<RecordId>
  const touchedSections = collectTouchedSectionRecords({
    previousSections,
    sections: input.sections,
    touchedRecords
  })
  let changed = previous.bySection.size !== input.sections.order.length

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, SectionAggregateState>>()

  input.sections.order.forEach(sectionKey => {
    const currentSection = input.sections.byKey.get(sectionKey)
    const previousSection = previousSections.byKey.get(sectionKey)
    if (!currentSection) {
      return
    }

    const previousByField = previous.bySection.get(sectionKey) ?? EMPTY_FIELD_SUMMARIES
    const sectionTouchedRecords = touchedSections.recordsBySection.get(sectionKey)
    if (!sectionTouchedRecords?.length) {
      bySection.set(sectionKey, previousByField)
      return
    }

    const nextByField = createMapPatchBuilder(previousByField)
    const membershipChanged = !previousSection || touchedSections.membershipChanged.has(sectionKey)

    calcFields.forEach(fieldId => {
      const fieldIndex = input.index.calculations.fields.get(fieldId)
      const fieldEntries = fieldIndex?.entries ?? EMPTY_FIELD_ENTRIES
      const previousFieldState = previousByField.get(fieldId)
      const fieldTouched = input.touchedFields === 'all' || input.touchedFields.has(fieldId)

      if (!previousSection || !previousFieldState) {
        nextByField.set(fieldId, buildSectionFieldState({
          sectionIds: currentSection.recordIds,
          entries: fieldEntries
        }))
        return
      }

      if (!membershipChanged && !fieldTouched) {
        return
      }

      const entries = createMapPatchBuilder(previousFieldState.entries)
      const aggregate = createAggregateBuilder(previousFieldState)
      let fieldChanged = false

      sectionTouchedRecords.forEach(recordId => {
        const wasInSection = isRecordInSection(previousSections, sectionKey, recordId)
        const isInSection = isRecordInSection(input.sections, sectionKey, recordId)

        if (!wasInSection && !isInSection) {
          return
        }

        const previousEntry = wasInSection
          ? previousFieldState.entries.get(recordId)
          : undefined
        const nextEntry = isInSection
          ? fieldEntries.get(recordId)
          : undefined

        if (sameAggregateEntry(previousEntry, nextEntry)) {
          return
        }

        fieldChanged = true
        if (nextEntry) {
          entries.set(recordId, nextEntry)
        } else {
          entries.delete(recordId)
        }
        aggregate.apply(previousEntry, nextEntry)
      })

      if (!fieldChanged) {
        return
      }

      const nextEntries = entries.finish()
      nextByField.set(fieldId, {
        ...aggregate.finish(nextEntries),
        entries: nextEntries
      })
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
