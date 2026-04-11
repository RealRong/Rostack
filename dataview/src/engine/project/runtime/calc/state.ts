import type {
  FieldId,
  View
} from '@dataview/core/contracts'
import {
  sameOrder
} from '@shared/core'
import {
  buildAggregateState
} from '../../../index/aggregate'
import type {
  AggregateEntry,
  AggregateState,
  IndexState
} from '../../../index/types'
import type {
  SectionKey
} from '../../readModels'
import type {
  CalcState,
  SectionState
} from '../state'

export const EMPTY_AGGREGATES = new Map<FieldId, AggregateState>()

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
}): AggregateState => buildAggregateState(new Map(
  input.sectionIds.flatMap(recordId => {
    const entry = input.entries.get(recordId)
    return entry
      ? [[recordId, entry] as const]
      : []
  })
))

export const buildCalcState = (input: {
  sections: SectionState
  view: View
  index: IndexState
}): CalcState => {
  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, AggregateState>>()
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

    const byField = new Map<FieldId, AggregateState>()
    calcFields.forEach(fieldId => {
      const entries = input.index.calculations.fields.get(fieldId)?.global.entries
      if (!entries) {
        return
      }

      byField.set(fieldId, buildSectionFieldState({
        sectionIds: section.ids,
        entries
      }))
    })
    bySection.set(sectionKey, byField)
  })

  return {
    bySection
  }
}
