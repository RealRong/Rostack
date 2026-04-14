import type {
  CalculationCollection,
  CalculationResult
} from '@dataview/core/calculation'
import type {
  FieldId
} from '@dataview/core/contracts'
import type {
  SectionAggregateState
} from '@dataview/engine/active/index/contracts'
import type {
  SectionKey,
  ViewSummaries
} from '@dataview/engine/contracts/shared'

export interface SummaryStateShape {
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<FieldId, SectionAggregateState>>
}

export const EMPTY_SECTION_SUMMARY_AGGREGATES = new Map<FieldId, SectionAggregateState>()

const EMPTY_SUMMARY_BY_SECTION = new Map<SectionKey, ReadonlyMap<FieldId, SectionAggregateState>>()

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
  previous: ReadonlyMap<SectionKey, T> | undefined,
  sectionKeys: readonly SectionKey[],
  emptyValue: T
) => Boolean(
  previous
  && previous.size === sectionKeys.length
  && sectionKeys.every(sectionKey => previous.get(sectionKey) === emptyValue)
)

export const buildEmptySummaryState = (
  sectionKeys: readonly SectionKey[],
  previous?: SummaryStateShape
): SummaryStateShape => {
  if (sameEmptySectionMap(previous?.bySection, sectionKeys, EMPTY_SECTION_SUMMARY_AGGREGATES)) {
    return previous as SummaryStateShape
  }

  return {
    bySection: new Map(
      sectionKeys.map(sectionKey => [sectionKey, EMPTY_SECTION_SUMMARY_AGGREGATES] as const)
    )
  }
}

export const buildEmptyPublishedSummaries = (
  sectionKeys: readonly SectionKey[],
  previous?: ViewSummaries
): ViewSummaries => {
  if (sameEmptySectionMap(previous, sectionKeys, EMPTY_SUMMARY_COLLECTION)) {
    return previous as ViewSummaries
  }

  return new Map(
    sectionKeys.map(sectionKey => [sectionKey, EMPTY_SUMMARY_COLLECTION] as const)
  )
}
