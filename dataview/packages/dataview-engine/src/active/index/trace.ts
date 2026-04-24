import type {
  IndexStageTrace
} from '@dataview/engine/contracts/performance'
import { mutationTrace } from '@shared/core'
import type {
  SearchIndex
} from '@dataview/engine/active/index/contracts'
import type {
  BaseImpact
} from '@dataview/engine/active/shared/baseImpact'

export const fullRebuildFrom = (
  impact: BaseImpact
) => impact.trace.reset === true

export const touchedRecordCountOfImpact = (
  impact: BaseImpact
): number | 'all' | undefined => mutationTrace.toTouchedCount(
  impact.touchedRecords
)

export const touchedFieldCountOfImpact = (
  impact: BaseImpact
): number | 'all' | undefined => mutationTrace.toTouchedCount(
  impact.touchedFields
)

export const searchEntryCountOf = (
  search: SearchIndex
): number => {
  let count = 0

  search.fields.forEach(field => {
    count += field.texts.size
  })

  return count
}

export const createIndexStageTrace = (input: {
  previous: unknown
  next: unknown
  rebuild: boolean
  durationMs: number
  inputSize?: number
  outputSize?: number
  touchedRecordCount?: number | 'all'
  touchedFieldCount?: number | 'all'
}): IndexStageTrace => ({
  action: input.previous === input.next
    ? 'reuse'
    : input.rebuild
      ? 'rebuild'
      : 'sync',
  changed: input.previous !== input.next,
  ...(input.inputSize === undefined ? {} : { inputSize: input.inputSize }),
  ...(input.outputSize === undefined ? {} : { outputSize: input.outputSize }),
  ...(input.touchedRecordCount === undefined ? {} : { touchedRecordCount: input.touchedRecordCount }),
  ...(input.touchedFieldCount === undefined ? {} : { touchedFieldCount: input.touchedFieldCount }),
  durationMs: input.durationMs
})
