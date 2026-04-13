import type {
  CommitDelta
} from '@dataview/core/contracts'
import type {
  IndexStageTrace
} from '#engine/contracts/public.ts'
import type {
  SearchIndex
} from '#engine/active/index/contracts.ts'
import {
  createFieldSyncContext
} from '#engine/active/index/sync.ts'

export const fullRebuildFrom = (
  delta: CommitDelta
) => (
  delta.entities.records?.update === 'all'
  || delta.entities.fields?.update === 'all'
  || delta.entities.values?.records === 'all'
  || delta.entities.values?.fields === 'all'
)

export const touchedRecordCountOf = (
  delta: CommitDelta
): number | 'all' | undefined => {
  const touched = createFieldSyncContext(delta).touchedRecords
  return touched === 'all'
    ? 'all'
    : touched.size || undefined
}

export const touchedFieldCountOf = (
  delta: CommitDelta
): number | 'all' | undefined => {
  if (
    delta.entities.fields?.update === 'all'
    || delta.entities.values?.fields === 'all'
  ) {
    return 'all'
  }

  const context = createFieldSyncContext(delta, {
    includeTitlePatch: true
  })
  const touched = new Set([
    ...context.schemaFields,
    ...context.valueFields
  ])
  return touched.size || undefined
}

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
