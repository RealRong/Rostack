import type {
  CalculationCollection
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
  computeCalculationFromState
} from '@dataview/engine/active/snapshot/summary/compute'
import {
  readCalcFields
} from '@dataview/engine/active/snapshot/summary/compute'
import {
  buildEmptyPublishedSummaries,
  createSummaryCollection
} from '@dataview/engine/summary/empty'

export const publishSummaries = (input: {
  summary: SummaryState
  previousSummary?: SummaryState
  previous?: ReadonlyMap<SectionKey, CalculationCollection>
  fieldsById: ReadonlyMap<FieldId, Field>
  view: View
}): ReadonlyMap<SectionKey, CalculationCollection> => {
  const calcFields = readCalcFields(input.view)
  const sectionKeys = [...input.summary.bySection.keys()]

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
  )

  input.summary.bySection.forEach((states, sectionKey) => {
    const previousCollection = input.previousSummary?.bySection.get(sectionKey) === states
      ? input.previous?.get(sectionKey)
      : undefined

    if (previousCollection) {
      next.set(sectionKey, previousCollection)
      return
    }

    const byField = new Map<FieldId, import('@dataview/core/calculation').CalculationResult>()
    calcFields.forEach(fieldId => {
      const metric = input.view.calc[fieldId]
      const state = states.get(fieldId)
      if (!metric || !state) {
        return
      }

      byField.set(fieldId, computeCalculationFromState({
        field: input.fieldsById.get(fieldId),
        metric,
        state
      }))
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
