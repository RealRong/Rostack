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
  SectionId
} from '@dataview/engine/contracts/shared'
import type {
  SummaryPhaseState as SummaryState
} from '@dataview/engine/active/state'
import { equal } from '@shared/core'
import {
  buildEmptyPublishedSummaries,
  createSummaryCollection
} from '@dataview/engine/active/summary/empty'

const readCalcFields = (
  view: View
): readonly FieldId[] => Object.entries(view.calc)
  .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])

export const publishSummaries = (input: {
  summary: SummaryState
  previousSummary?: SummaryState
  previous?: ReadonlyMap<SectionId, CalculationCollection>
  fieldsById: ReadonlyMap<FieldId, Field>
  view: View
}): ReadonlyMap<SectionId, CalculationCollection> => {
  const calcFields = readCalcFields(input.view)
  const sectionIds = [...input.summary.bySection.keys()]
  const previousKeys = input.previous
    ? [...input.previous.keys()]
    : undefined

  if (!calcFields.length) {
    return buildEmptyPublishedSummaries(
      sectionIds,
      input.previous
    )
  }

  const next = new Map<SectionId, CalculationCollection>()
  let sameAsPrevious = Boolean(
    input.previous
    && input.previous.size === input.summary.bySection.size
    && previousKeys
    && equal.sameOrder(previousKeys, sectionIds)
  )

  input.summary.bySection.forEach((states, sectionId) => {
    const previousCollection = input.previousSummary?.bySection.get(sectionId) === states
      ? input.previous?.get(sectionId)
      : undefined

    if (previousCollection) {
      next.set(sectionId, previousCollection)
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
    next.set(sectionId, collection)
    if (sameAsPrevious && input.previous?.get(sectionId) !== collection) {
      sameAsPrevious = false
    }
  })

  return sameAsPrevious
    ? input.previous ?? next
    : next
}
