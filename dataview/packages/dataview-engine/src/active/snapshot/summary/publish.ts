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

  if (!calcFields.length) {
    return buildEmptyPublishedSummaries(
      Array.from(input.summary.bySection.keys()),
      input.previous
    )
  }

  const next = new Map(
    Array.from(input.summary.bySection.entries()).map(([sectionKey, states]) => [
      sectionKey,
      (
        input.previousSummary?.bySection.get(sectionKey) === states
          ? input.previous?.get(sectionKey)
          : undefined
      ) ?? createSummaryCollection(new Map(
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
