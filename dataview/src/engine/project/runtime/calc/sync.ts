import type {
  FieldId,
  View
} from '@dataview/core/contracts'
import {
  buildAggregateState,
  patchAggregateState
} from '../../../index/aggregate'
import type {
  AggregateEntry,
  AggregateState,
  IndexState
} from '../../../index/types'
import type {
  SectionKey
} from '../../types'
import type {
  CalcState,
  SectionState
} from '../state'
import {
  buildCalcState,
  buildSectionFieldState,
  EMPTY_AGGREGATES,
  readCalcFields,
  sameIds
} from './state'

const sameEntry = (
  left: AggregateEntry | undefined,
  right: AggregateEntry | undefined
) => JSON.stringify(left) === JSON.stringify(right)

export const syncCalcState = (input: {
  previous?: CalcState
  previousSections?: SectionState
  sections: SectionState
  view: View
  index: IndexState
  action: 'reuse' | 'sync' | 'rebuild'
  touchedRecords: ReadonlySet<string> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
}): CalcState => {
  const previousState = input.previous
  if (input.action === 'reuse' && previousState) {
    return previousState
  }

  const calcFields = readCalcFields(input.view)

  if (!calcFields.length) {
    const nextBySection = new Map<SectionKey, ReadonlyMap<FieldId, AggregateState>>()
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
    return buildCalcState({
      sections: input.sections,
      view: input.view,
      index: input.index
    })
  }

  const previous = input.previous
  const previousSections = input.previousSections
  const touchedRecords = input.touchedRecords as ReadonlySet<string>
  const touchedSectionKeys = new Set<SectionKey>()

  touchedRecords.forEach(recordId => {
    ;(previousSections.byRecord.get(recordId) ?? []).forEach(sectionKey => touchedSectionKeys.add(sectionKey))
    ;(input.sections.byRecord.get(recordId) ?? []).forEach(sectionKey => touchedSectionKeys.add(sectionKey))
  })

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, AggregateState>>()

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
    const nextByField = new Map<FieldId, AggregateState>()

    calcFields.forEach(fieldId => {
      if (!previousSection || !previousByField.has(fieldId)) {
        const entries = input.index.calculations.fields.get(fieldId)?.global.entries
        nextByField.set(
          fieldId,
          entries
            ? buildSectionFieldState({
                sectionIds: currentSection.ids,
                entries
              })
            : buildAggregateState(new Map())
        )
        return
      }

      if (input.touchedFields !== 'all' && !input.touchedFields.has(fieldId)) {
        nextByField.set(
          fieldId,
          sameIds(previousSection.ids, currentSection.ids)
            ? (previousByField.get(fieldId) ?? buildAggregateState(new Map()))
            : buildSectionFieldState({
                sectionIds: currentSection.ids,
                entries: input.index.calculations.fields.get(fieldId)?.global.entries ?? new Map()
              })
        )
        return
      }

      let state = previousByField.get(fieldId)
      if (!state) {
        return
      }

      const entries = input.index.calculations.fields.get(fieldId)?.global.entries
      if (!entries) {
        nextByField.set(fieldId, state)
        return
      }

      touchedRecords.forEach(recordId => {
        const previousEntry = state?.entries.get(recordId)
        const nextEntry = currentSection.ids.includes(recordId)
          ? entries.get(recordId)
          : undefined
        if (sameEntry(previousEntry, nextEntry)) {
          return
        }

        state = patchAggregateState({
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
