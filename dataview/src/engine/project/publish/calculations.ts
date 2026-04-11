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
} from '../model'
import type {
  CalcState
} from '../runtime/state'
import {
  computeCalculationFromState
} from '../runtime/calc/compute'
import {
  readCalcFields
} from '../runtime/calc/state'

const createCollection = (
  byField: ReadonlyMap<FieldId, CalculationResult>
): CalculationCollection => ({
  byField,
  get: fieldId => byField.get(fieldId)
})

const EMPTY_COLLECTION = createCollection(new Map())

export const publishCalculations = (input: {
  calc: CalcState
  previousCalc?: CalcState
  previous?: ReadonlyMap<SectionKey, CalculationCollection>
  fieldsById: ReadonlyMap<FieldId, Field>
  view: View
}): ReadonlyMap<SectionKey, CalculationCollection> => {
  const calcFields = readCalcFields(input.view)

  if (!calcFields.length) {
    const next = new Map<SectionKey, CalculationCollection>(
      Array.from(input.calc.bySection.keys()).map(sectionKey => [sectionKey, EMPTY_COLLECTION] as const)
    )

    return input.previous
      && input.previous.size === next.size
      && Array.from(next.keys()).every(key => input.previous?.get(key) === EMPTY_COLLECTION)
      ? input.previous
      : next
  }

  const next = new Map(
    Array.from(input.calc.bySection.entries()).map(([sectionKey, states]) => [
      sectionKey,
      (
        input.previousCalc?.bySection.get(sectionKey) === states
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
