import type {
  CalculationCollection,
  CalculationResult,
  FieldReducerState
} from '@dataview/core/view'
import type {
  FieldId
} from '@dataview/core/types'
import type {
  SectionId,
  ViewSummaries
} from '@dataview/engine/contracts/shared'

export interface SummaryStateShape {
  bySection: ReadonlyMap<SectionId, ReadonlyMap<FieldId, FieldReducerState>>
}

export const EMPTY_SECTION_SUMMARY_AGGREGATES = new Map<FieldId, FieldReducerState>()

const EMPTY_SUMMARY_BY_SECTION = new Map<SectionId, ReadonlyMap<FieldId, FieldReducerState>>()

export const EMPTY_SUMMARY_STATE: SummaryStateShape = {
  bySection: EMPTY_SUMMARY_BY_SECTION
}

export const createSummaryCollection = (
  byField: ReadonlyMap<FieldId, CalculationResult>
): CalculationCollection => ({
  byField,
  get: fieldId => byField.get(fieldId)
})

export const EMPTY_SUMMARY_COLLECTION = createSummaryCollection(new Map())

const sameEmptySectionMap = <T,>(
  previous: ReadonlyMap<SectionId, T> | undefined,
  sectionIds: readonly SectionId[],
  emptyValue: T
) => Boolean(
  previous
  && previous.size === sectionIds.length
  && [...previous.keys()].every((sectionId, index) => (
    sectionId === sectionIds[index]
    && previous.get(sectionId) === emptyValue
  ))
)

const createEmptySectionMap = <T,>(
  sectionIds: readonly SectionId[],
  value: T
): ReadonlyMap<SectionId, T> => {
  const map = new Map<SectionId, T>()

  sectionIds.forEach(sectionId => {
    map.set(sectionId, value)
  })

  return map
}

export const buildEmptySummaryState = (
  sectionIds: readonly SectionId[],
  previous?: SummaryStateShape
): SummaryStateShape => {
  if (sameEmptySectionMap(previous?.bySection, sectionIds, EMPTY_SECTION_SUMMARY_AGGREGATES)) {
    return previous as SummaryStateShape
  }

  return {
    bySection: createEmptySectionMap(sectionIds, EMPTY_SECTION_SUMMARY_AGGREGATES)
  }
}

export const buildEmptyPublishedSummaries = (
  sectionIds: readonly SectionId[],
  previous?: ViewSummaries
): ViewSummaries => {
  if (sameEmptySectionMap(previous, sectionIds, EMPTY_SUMMARY_COLLECTION)) {
    return previous as ViewSummaries
  }

  return createEmptySectionMap(sectionIds, EMPTY_SUMMARY_COLLECTION)
}
