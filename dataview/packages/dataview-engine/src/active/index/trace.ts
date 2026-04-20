import type {
  IndexStageTrace
} from '@dataview/engine/contracts'
import type {
  SearchIndex
} from '@dataview/engine/active/index/contracts'
import type {
  ActiveImpact
} from '@dataview/engine/active/shared/impact'

export const fullRebuildFrom = (
  impact: ActiveImpact
) => impact.commit.reset === true

export const touchedRecordCountOfImpact = (
  impact: ActiveImpact
): number | 'all' | undefined => impact.base.touchedRecords === 'all'
  ? 'all'
  : impact.base.touchedRecords.size || undefined

export const touchedFieldCountOfImpact = (
  impact: ActiveImpact
): number | 'all' | undefined => impact.base.touchedFields === 'all'
  ? 'all'
  : impact.base.touchedFields.size || undefined

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
