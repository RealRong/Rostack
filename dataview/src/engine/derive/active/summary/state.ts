import type {
  FieldId,
  View
} from '@dataview/core/contracts'
import {
  sameOrder
} from '@shared/core'
import {
  buildSectionAggregateState
} from '../../../index/aggregate'
import type {
  AggregateEntry,
  AggregateState,
  IndexState,
  SectionAggregateState
} from '../../../index/types'
import type {
  SectionKey
} from '../../../contracts/public'
import type {
  SectionState,
  SummaryState
} from '../../../contracts/internal'

export const EMPTY_AGGREGATES = new Map<FieldId, SectionAggregateState>()

export const readCalcFields = (
  view: View
): readonly FieldId[] => Object.entries(view.calc)
  .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])

export const sameIds = (
  left: readonly string[],
  right: readonly string[]
) => sameOrder(left, right)

export const buildSectionFieldState = (input: {
  sectionIds: readonly string[]
  entries: ReadonlyMap<string, AggregateEntry>
}): SectionAggregateState => buildSectionAggregateState(new Map(
  input.sectionIds.flatMap(recordId => {
    const entry = input.entries.get(recordId)
    return entry
      ? [[recordId, entry] as const]
      : []
  })
))

export const buildSummaryState = (input: {
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
