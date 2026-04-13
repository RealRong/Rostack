import type {
  CalculationCollection,
  CalculationResult
} from '@dataview/core/calculation'
import type {
  Field,
  FieldId,
  View
} from '@dataview/core/contracts'
import type {
  SectionKey
} from '../../../contracts/public'
import type {
  SummaryState
} from '../../../contracts/internal'
import {
  computeCalculationFromState
} from './compute'
import {
  readCalcFields
} from './compute'

const createCollection = (
  byField: ReadonlyMap<FieldId, CalculationResult>
): CalculationCollection => ({
  byField,
  get: fieldId => byField.get(fieldId)
})

const EMPTY_COLLECTION = createCollection(new Map())

export const publishSummaries = (input: {
  summary: SummaryState
  previousSummary?: SummaryState
  previous?: ReadonlyMap<SectionKey, CalculationCollection>
  fieldsById: ReadonlyMap<FieldId, Field>
  view: View
}): ReadonlyMap<SectionKey, CalculationCollection> => {
  const calcFields = readCalcFields(input.view)

  if (!calcFields.length) {
    const next = new Map<SectionKey, CalculationCollection>(
      Array.from(input.summary.bySection.keys()).map(sectionKey => [sectionKey, EMPTY_COLLECTION] as const)
    )

    return input.previous
      && input.previous.size === next.size
      && Array.from(next.keys()).every(key => input.previous?.get(key) === EMPTY_COLLECTION)
      ? input.previous
      : next
  }

  const next = new Map(
    Array.from(input.summary.bySection.entries()).map(([sectionKey, states]) => [
      sectionKey,
      (
        input.previousSummary?.bySection.get(sectionKey) === states
          ? input.previous?.get(sectionKey)
          : undefined
      ) ?? createCollection(new Map(
        calcFields.flatMap(fieldId => {
          const metric = input.view.calc[fieldId]
          const state = states.get(fieldId)
          return state
            ? [[
                fieldId,
                computeCalculationFromState({
                  field: input.fieldsById.get(fieldId),
                  metric: metric!,
                  state
                })
              ] as const]
            : []
        })
      ))
    ] as const)
  )

  return input.previous
    && input.previous.size === next.size
    && Array.from(next.entries()).every(([key, value]) => input.previous?.get(key) === value)
    ? input.previous
    : next
}
