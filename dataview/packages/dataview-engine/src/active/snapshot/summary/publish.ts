import type {
  CalculationCollection,
  CalculationResult
} from '@dataview/core/calculation'
import {
  calculation
} from '@dataview/core/calculation'
import type {
  Field,
  FieldId,
  View
} from '@dataview/core/contracts'
import type {
  SectionKey
} from '@dataview/engine/contracts/public'
import type {
  SummaryState
} from '@dataview/engine/contracts/internal'
import {
  sameOrder
} from '@shared/core'
import {
  buildEmptyPublishedSummaries,
  createSummaryCollection
} from '@dataview/engine/summary/empty'

const readCalcFields = (
  view: View
): readonly FieldId[] => Object.entries(view.calc)
  .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])

export const publishSummaries = (input: {
  summary: SummaryState
  previousSummary?: SummaryState
  previous?: ReadonlyMap<SectionKey, CalculationCollection>
  fieldsById: ReadonlyMap<FieldId, Field>
  view: View
}): ReadonlyMap<SectionKey, CalculationCollection> => {
  const calcFields = readCalcFields(input.view)
  const sectionKeys = [...input.summary.bySection.keys()]
  const previousKeys = input.previous
    ? [...input.previous.keys()]
    : undefined

  if (!calcFields.length) {
    return buildEmptyPublishedSummaries(
      sectionKeys,
      input.previous
    )
  }

  const next = new Map<SectionKey, CalculationCollection>()
  let sameAsPrevious = Boolean(
    input.previous
    && input.previous.size === input.summary.bySection.size
    && previousKeys
    && sameOrder(previousKeys, sectionKeys)
  )

  input.summary.bySection.forEach((states, sectionKey) => {
    const previousCollection = input.previousSummary?.bySection.get(sectionKey) === states
      ? input.previous?.get(sectionKey)
      : undefined

    if (previousCollection) {
      next.set(sectionKey, previousCollection)
      return
    }

    const byField = new Map<FieldId, CalculationResult>()
    calcFields.forEach(fieldId => {
      const metric = input.view.calc[fieldId]
      const state = states.get(fieldId)
      if (!metric || !state) {
        return
      }

      byField.set(
        fieldId,
        calculation.metric.compute(input.fieldsById.get(fieldId), metric, state)
      )
    })

    const collection = createSummaryCollection(byField)
    next.set(sectionKey, collection)
    if (sameAsPrevious && input.previous?.get(sectionKey) !== collection) {
      sameAsPrevious = false
    }
  })

  return sameAsPrevious
    ? input.previous ?? next
    : next
}
