import type {
  CommitImpact
} from '@dataview/core/contracts'
import {
  touchedFieldCountOfImpact,
  touchedRecordCountOfImpact
} from '@dataview/core/commit/impact'
import type {
  IndexStageTrace
} from '@dataview/engine/contracts/public'
import type {
  SearchIndex
} from '@dataview/engine/active/index/contracts'

export const fullRebuildFrom = (
  impact: CommitImpact
) => impact.reset === true

export const touchedRecordCountOf = (
  impact: CommitImpact
): number | 'all' | undefined => touchedRecordCountOfImpact(impact)

export const touchedFieldCountOf = (
  impact: CommitImpact
): number | 'all' | undefined => touchedFieldCountOfImpact(impact)

export const searchEntryCountOf = (
  search: SearchIndex
): number => (
  (search.all?.texts.size ?? 0)
  + Array.from(search.fields.values()).reduce((count, field) => count + field.texts.size, 0)
)

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
