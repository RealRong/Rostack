import type {
  FieldId,
  RecordId,
  View
} from '@dataview/core/contracts'
import { sameOrder } from '@shared/core'
import {
  buildSectionAggregateState,
  patchSectionAggregateState,
  sameAggregateEntry
} from '../../index/aggregate'
import type {
  IndexState,
  SectionAggregateState
} from '../../index/types'
import type { SectionKey } from '../../../contracts/public'
import type {
  SectionState,
  SummaryState
} from '../../../contracts/internal'
import { readCalcFields } from './compute'

const EMPTY_AGGREGATES = new Map<FieldId, SectionAggregateState>()

const sameIds = (
  left: readonly string[],
  right: readonly string[]
) => sameOrder(left, right)

const buildSectionFieldState = (input: {
  sectionIds: readonly string[]
  entries: ReadonlyMap<string, import('../../index/types').AggregateEntry>
}): SectionAggregateState => buildSectionAggregateState(new Map(
  input.sectionIds.flatMap(recordId => {
    const entry = input.entries.get(recordId)
    return entry
      ? [[recordId, entry] as const]
      : []
  })
))

const buildSummaryState = (input: {
  sections: SectionState
  view: View
  index: IndexState
}): SummaryState => {
  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, SectionAggregateState>>()
  const calcFields = readCalcFields(input.view)

  if (!calcFields.length) {
    input.sections.order.forEach(sectionKey => {
      if (input.sections.byKey.get(sectionKey)) {
        bySection.set(sectionKey, EMPTY_AGGREGATES)
      }
    })

    return {
      bySection
    }
  }

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
) => (sections.byRecord.get(recordId) ?? []).includes(sectionKey)

const buildEmptyFieldState = (): SectionAggregateState => buildSectionAggregateState(new Map())

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
    const nextBySection = new Map<SectionKey, ReadonlyMap<FieldId, SectionAggregateState>>()
    input.sections.order.forEach(sectionKey => {
      if (input.sections.byKey.get(sectionKey)) {
        nextBySection.set(sectionKey, EMPTY_AGGREGATES)
      }
    })

    return previousState
      && previousState.bySection.size === nextBySection.size
      && Array.from(nextBySection.keys()).every(key => previousState.bySection.get(key) === EMPTY_AGGREGATES)
      ? previousState
      : {
          bySection: nextBySection
        }
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
  const touchedSectionKeys = new Set<SectionKey>()

  touchedRecords.forEach(recordId => {
    ;(previousSections.byRecord.get(recordId) ?? []).forEach(sectionKey => touchedSectionKeys.add(sectionKey))
    ;(input.sections.byRecord.get(recordId) ?? []).forEach(sectionKey => touchedSectionKeys.add(sectionKey))
  })

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, SectionAggregateState>>()

  input.sections.order.forEach(sectionKey => {
    const currentSection = input.sections.byKey.get(sectionKey)
    const previousSection = previousSections.byKey.get(sectionKey)
    if (!currentSection) {
      return
    }

    if (!touchedSectionKeys.has(sectionKey)) {
      bySection.set(sectionKey, previous.bySection.get(sectionKey) ?? new Map())
      return
    }

    const previousByField = previous.bySection.get(sectionKey) ?? new Map()
    const nextByField = new Map<FieldId, SectionAggregateState>()

    calcFields.forEach(fieldId => {
      const fieldIndex = input.index.calculations.fields.get(fieldId)
      const fieldEntries = fieldIndex?.entries ?? new Map()
      const previousFieldState = previousByField.get(fieldId)

      if (!previousSection || !previousFieldState) {
        nextByField.set(
          fieldId,
          fieldEntries.size
            ? buildSectionFieldState({
                sectionIds: currentSection.recordIds,
                entries: fieldEntries
              })
            : buildEmptyFieldState()
        )
        return
      }

      if (
        input.touchedFields !== 'all'
        && !input.touchedFields.has(fieldId)
        && sameIds(previousSection.recordIds, currentSection.recordIds)
      ) {
        nextByField.set(fieldId, previousFieldState)
        return
      }

      let state = previousFieldState

      touchedRecords.forEach(recordId => {
        const wasInSection = isRecordInSection(previousSections, sectionKey, recordId)
        const isInSection = isRecordInSection(input.sections, sectionKey, recordId)

        if (!wasInSection && !isInSection) {
          return
        }

        const previousEntry = wasInSection
          ? state.entries.get(recordId)
          : undefined
        const nextEntry = isInSection
          ? fieldEntries.get(recordId)
          : undefined

        if (sameAggregateEntry(previousEntry, nextEntry)) {
          return
        }

        state = patchSectionAggregateState({
          state,
          recordId,
          previous: previousEntry,
          next: nextEntry
        })
      })

      nextByField.set(fieldId, state)
    })

    bySection.set(
      sectionKey,
      Array.from(nextByField.entries()).every(([fieldId, state]) => previousByField.get(fieldId) === state)
        ? previousByField
        : nextByField
    )
  })

  return {
    bySection
  }
}
